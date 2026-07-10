import { execFileSync } from 'node:child_process';

const API_BASE = 'https://api.github.com';
const GRAPHQL_URL = `${API_BASE}/graphql`;
const MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 500;
/** Cap on aliases per batched GraphQL query — keeps query size/cost well under GitHub's limits. */
const MAX_BLOB_BATCH_SIZE = 100;

/** Thrown when the GitHub API responds with a non-2xx, non-404 status. */
export class GithubApiError extends Error {
  constructor(
    public readonly status: number,
    action: string,
  ) {
    super(`GitHub API error ${status}: failed to ${action}`);
    this.name = 'GithubApiError';
  }
}

/** Thrown when a GraphQL response comes back 200 OK but carries a non-retryable `errors` payload. */
export class GithubGraphqlError extends Error {
  constructor(
    public readonly errors: unknown[],
    action: string,
  ) {
    super(`GitHub GraphQL error: failed to ${action}: ${JSON.stringify(errors)}`);
    this.name = 'GithubGraphqlError';
  }
}

let cachedToken: string | undefined;

export function resolveToken(): string {
  if (cachedToken) return cachedToken;
  if (process.env.GITHUB_TOKEN) {
    cachedToken = process.env.GITHUB_TOKEN;
    return cachedToken;
  }
  try {
    const t = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (t) {
      cachedToken = t;
      return cachedToken;
    }
  } catch {
    // gh not installed or not authenticated
  }
  throw new Error('No GitHub token found. Set GITHUB_TOKEN or run `gh auth login`.');
}

function headers(accept = 'application/vnd.github+json'): Record<string, string> {
  return {
    Authorization: `Bearer ${resolveToken()}`,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Rate-limited (429, or 403 with rate-limit headers) or transient server-side (5xx) — safe to retry. */
function isRetryableStatus(response: Response): boolean {
  if (response.status === 429 || response.status >= 500) return true;
  if (response.status === 403) {
    return (
      response.headers.get('retry-after') !== null ||
      response.headers.get('x-ratelimit-remaining') === '0'
    );
  }
  return false;
}

function retryDelayMs(response: Response | undefined, attempt: number): number {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
  }
  const resetHeader = response?.headers.get('x-ratelimit-reset');
  if (resetHeader) {
    const resetMs = Number(resetHeader) * 1000 - Date.now();
    if (Number.isFinite(resetMs) && resetMs > 0) return resetMs;
  }
  return RETRY_BASE_DELAY_MS * 2 ** attempt;
}

/**
 * Fetches with retry/backoff on rate limits, transient server errors, and network failures.
 * Non-retryable responses (2xx, 404, other 4xx) are returned as-is for the caller to interpret —
 * only genuinely transient failures are retried here, so a real 404 is never mistaken for one.
 */
async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  let lastNetworkError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      lastNetworkError = err;
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(retryDelayMs(undefined, attempt));
        continue;
      }
      throw new Error(
        `GitHub API request failed after ${MAX_ATTEMPTS} attempts: ${(err as Error).message}`,
      );
    }
    if (
      response.ok ||
      response.status === 404 ||
      !isRetryableStatus(response) ||
      attempt === MAX_ATTEMPTS - 1
    ) {
      return response;
    }
    await sleep(retryDelayMs(response, attempt));
  }
  // Unreachable: the loop always returns or throws.
  throw lastNetworkError instanceof Error
    ? lastNetworkError
    : new Error('GitHub API request failed');
}

/**
 * GraphQL equivalent of a single REST call, retrying on top of the transport-level retries in
 * fetchWithRetry: a 200 response can still carry a `RATE_LIMITED` error in its `errors` array,
 * which fetchWithRetry can't see because it only looks at the HTTP status.
 */
async function graphqlRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  action: string,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const response = await fetchWithRetry(GRAPHQL_URL, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new GithubApiError(response.status, action);
    const json = (await response.json()) as { data?: T; errors?: Array<{ type?: string }> };
    if (json.errors?.length) {
      const rateLimited = json.errors.some((e) => e.type === 'RATE_LIMITED');
      if (rateLimited && attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      // A NOT_FOUND error on a nullable field (e.g. a PR number that doesn't exist) comes back
      // as a *partial* response: `data` is still present with a null at that path. Let callers
      // interpret the null themselves instead of treating every such lookup as a hard failure.
      const onlyNotFound = json.errors.every((e) => e.type === 'NOT_FOUND');
      if (!onlyNotFound) throw new GithubGraphqlError(json.errors, action);
    }
    if (json.data === undefined) throw new GithubGraphqlError(json.errors ?? [], action);
    return json.data;
  }
  // Unreachable: the loop always returns or throws.
  throw new GithubGraphqlError([], action);
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

interface BlobRequest {
  repo: string;
  sha: string;
  path: string;
  resolve: (value: { text: string; isTruncated: boolean } | null) => void;
  reject: (err: unknown) => void;
}

let pendingBlobRequests: BlobRequest[] = [];
let blobFlushScheduled = false;

/**
 * Queues a blob fetch to be merged with any other ghFileAtSha calls made in the same
 * microtask tick (e.g. the Promise.all fan-outs in report.ts/discovery.ts) into one
 * batched GraphQL query, instead of one REST call per file. Falls back to the caller's
 * own REST call for a single blob if the batch flush call itself fails outright — see
 * ghFileAtSha, which retries via REST on a rejected queueBlobRequest.
 */
function queueBlobRequest(
  repo: string,
  sha: string,
  path: string,
): Promise<{ text: string; isTruncated: boolean } | null> {
  return new Promise((resolve, reject) => {
    pendingBlobRequests.push({ repo, sha, path, resolve, reject });
    if (!blobFlushScheduled) {
      blobFlushScheduled = true;
      queueMicrotask(flushBlobRequests);
    }
  });
}

async function flushBlobRequests(): Promise<void> {
  const batch = pendingBlobRequests;
  pendingBlobRequests = [];
  blobFlushScheduled = false;
  await Promise.all(chunk(batch, MAX_BLOB_BATCH_SIZE).map(flushBlobChunk));
}

interface BlobField {
  __typename?: string;
  text?: string;
  isTruncated?: boolean;
}

async function flushBlobChunk(requests: BlobRequest[]): Promise<void> {
  const byRepo = new Map<string, BlobRequest[]>();
  for (const req of requests) {
    const list = byRepo.get(req.repo) ?? [];
    list.push(req);
    byRepo.set(req.repo, list);
  }

  const variableDefs: string[] = [];
  const variables: Record<string, string> = {};
  const repoBlocks: string[] = [];
  const repoEntries = [...byRepo.entries()];

  repoEntries.forEach(([repo, reqs], repoIndex) => {
    const [owner, name] = repo.split('/');
    const ownerVar = `o${repoIndex}`;
    const nameVar = `n${repoIndex}`;
    variableDefs.push(`$${ownerVar}: String!`, `$${nameVar}: String!`);
    variables[ownerVar] = owner;
    variables[nameVar] = name;

    const fields = reqs.map((req, fieldIndex) => {
      const exprVar = `e${repoIndex}_${fieldIndex}`;
      variableDefs.push(`$${exprVar}: String!`);
      variables[exprVar] = `${req.sha}:${req.path}`;
      return `f${fieldIndex}: object(expression: $${exprVar}) { __typename ... on Blob { text isTruncated } }`;
    });

    repoBlocks.push(
      `r${repoIndex}: repository(owner: $${ownerVar}, name: $${nameVar}) {\n${fields.join('\n')}\n}`,
    );
  });

  const query = `query BatchBlobs(${variableDefs.join(', ')}) {\n${repoBlocks.join('\n')}\n}`;

  let data: Record<string, Record<string, BlobField | null>>;
  try {
    data = await graphqlRequest(query, variables, 'batch-fetch file contents');
  } catch (err) {
    for (const req of requests) req.reject(err);
    return;
  }

  repoEntries.forEach(([, reqs], repoIndex) => {
    const repoData = data[`r${repoIndex}`];
    reqs.forEach((req, fieldIndex) => {
      const field = repoData?.[`f${fieldIndex}`];
      if (!field || field.__typename !== 'Blob') {
        req.resolve(null);
      } else {
        req.resolve({ text: field.text ?? '', isTruncated: field.isTruncated ?? false });
      }
    });
  });
}

async function ghFileAtShaRest(sha: string, path: string, repo: string): Promise<string | null> {
  const url = `${API_BASE}/repos/${repo}/contents/${path}?ref=${sha}`;
  const response = await fetchWithRetry(url, {
    headers: headers('application/vnd.github.raw+json'),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new GithubApiError(response.status, `fetch file ${path}@${sha}`);
  return response.text();
}

export async function ghFileAtSha(sha: string, path: string, repo: string): Promise<string | null> {
  const result = await queueBlobRequest(repo, sha, path);
  if (result === null) return null;
  // GraphQL's Blob.text truncates large files — fall back to the REST raw endpoint,
  // which this project has relied on in production without a size problem.
  if (result.isTruncated) return ghFileAtShaRest(sha, path, repo);
  return result.text;
}

export async function ghLsTree(sha: string, repo: string): Promise<string[]> {
  const url = `${API_BASE}/repos/${repo}/git/trees/${sha}?recursive=1`;
  const response = await fetchWithRetry(url, { headers: headers() });
  if (response.status === 404) return [];
  if (!response.ok) throw new GithubApiError(response.status, `list tree ${sha}`);
  const data = (await response.json()) as {
    tree: Array<{ path: string; type: string }>;
    truncated: boolean;
  };
  return data.tree.filter((item) => item.type === 'blob').map((item) => item.path);
}

export interface PrShas {
  baseRefOid: string;
  headRefOid: string;
}

const PR_SHAS_QUERY = `
  query PrShas($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        baseRefOid
        headRefOid
      }
    }
  }
`;

export async function getPrShas(prNumber: string, repo: string): Promise<PrShas> {
  const [owner, name] = repo.split('/');
  const data = await graphqlRequest<{
    repository: { pullRequest: { baseRefOid: string; headRefOid: string } | null } | null;
  }>(PR_SHAS_QUERY, { owner, name, number: Number(prNumber) }, `fetch PR #${prNumber}`);
  const pullRequest = data.repository?.pullRequest;
  if (!pullRequest) throw new GithubApiError(404, `fetch PR #${prNumber}`);
  const { baseRefOid: baseSha, headRefOid: headSha } = pullRequest;

  // base.sha is the current tip of the base branch, not the merge-base.
  // If other PRs merged to the base after this PR was opened, comparing base.sha
  // vs head.sha would show their dep changes as false positives.
  // Use the compare endpoint to find the actual common ancestor (three-dot diff base).
  // GitHub's GraphQL API has no equivalent of REST's three-dot compare/merge-base lookup,
  // so this one call stays on REST.
  const compareUrl = `${API_BASE}/repos/${repo}/compare/${baseSha}...${headSha}`;
  const compareResp = await fetchWithRetry(compareUrl, { headers: headers() });
  if (compareResp.ok) {
    const compareData = (await compareResp.json()) as { merge_base_commit: { sha: string } };
    return { baseRefOid: compareData.merge_base_commit.sha, headRefOid: headSha };
  }

  return { baseRefOid: baseSha, headRefOid: headSha };
}

export function detectRepo(): string {
  const fromEnv = process.env.GITHUB_REPOSITORY;
  if (fromEnv) return fromEnv;

  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {
    // fall through
  }

  throw new Error('Could not detect GitHub repo — set GITHUB_REPOSITORY or pass --repo');
}
