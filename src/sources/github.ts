import { execFileSync } from 'child_process';

const API_BASE = 'https://api.github.com';

function token(): string {
  const t = process.env['GITHUB_TOKEN'];
  if (!t) throw new Error('GITHUB_TOKEN is required for GitHub API access');
  return t;
}

function headers(accept = 'application/vnd.github+json'): Record<string, string> {
  return {
    Authorization: `Bearer ${token()}`,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function ghFileAtSha(sha: string, path: string, repo: string): Promise<string | null> {
  const url = `${API_BASE}/repos/${repo}/contents/${path}?ref=${sha}`;
  const response = await fetch(url, {
    headers: headers('application/vnd.github.raw+json'),
  });
  if (!response.ok) return null;
  return response.text();
}

export async function ghLsTree(sha: string, repo: string): Promise<string[]> {
  const url = `${API_BASE}/repos/${repo}/git/trees/${sha}?recursive=1`;
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) return [];
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
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}: failed to fetch PR #${prNumber}`);
  }
  const data = (await response.json()) as { base: { sha: string }; head: { sha: string } };
  return { baseRefOid: data.base.sha, headRefOid: data.head.sha };
}

export function detectRepo(): string {
  const fromEnv = process.env['GITHUB_REPOSITORY'];
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

  throw new Error(
    'Could not detect GitHub repo — set GITHUB_REPOSITORY or pass --repo',
  );
}
