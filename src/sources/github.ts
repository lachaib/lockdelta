import { execFileSync } from 'node:child_process';

const API_BASE = 'https://api.github.com';
const MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 500;

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

export async function ghFileAtSha(sha: string, path: string, repo: string): Promise<string | null> {
  const url = `${API_BASE}/repos/${repo}/contents/${path}?ref=${sha}`;
  const response = await fetchWithRetry(url, {
    headers: headers('application/vnd.github.raw+json'),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new GithubApiError(response.status, `fetch file ${path}@${sha}`);
  return response.text();
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

export async function getPrShas(prNumber: string, repo: string): Promise<PrShas> {
  const url = `${API_BASE}/repos/${repo}/pulls/${prNumber}`;
  const response = await fetchWithRetry(url, { headers: headers() });
  if (!response.ok) {
    throw new GithubApiError(response.status, `fetch PR #${prNumber}`);
  }
  const data = (await response.json()) as { base: { sha: string }; head: { sha: string } };
  const baseSha = data.base.sha;
  const headSha = data.head.sha;

  // base.sha is the current tip of the base branch, not the merge-base.
  // If other PRs merged to the base after this PR was opened, comparing base.sha
  // vs head.sha would show their dep changes as false positives.
  // Use the compare endpoint to find the actual common ancestor (three-dot diff base).
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
