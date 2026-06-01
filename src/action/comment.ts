import { resolveToken } from '../sources/github.js';

const API_BASE = 'https://api.github.com';
const MARKER = '<!-- lockdelta -->';

interface GitHubComment {
  id: number;
  node_id: string;
  body: string;
}

interface ExistingComment {
  id: number;
  nodeId: string;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function findExistingComment(
  prNumber: string,
  repo: string,
  token: string,
): Promise<ExistingComment | null> {
  const url = `${API_BASE}/repos/${repo}/issues/${prNumber}/comments?per_page=100`;
  const response = await fetch(url, { headers: githubHeaders(token) });
  if (!response.ok) return null;
  const comments = (await response.json()) as GitHubComment[];
  const found = comments.find((c) => c.body.includes(MARKER));
  return found ? { id: found.id, nodeId: found.node_id } : null;
}

export async function postPrComment(
  markdown: string,
  prNumber: string,
  repo?: string,
): Promise<void> {
  if (!prNumber) throw new Error('post-comment requires a PR number');
  if (!repo) throw new Error('post-comment requires repo to be set');

  const t = resolveToken();
  const body = `${MARKER}\n\n${markdown}`;
  const hdrs = githubHeaders(t);

  const existing = await findExistingComment(prNumber, repo, t);

  let res: Response;
  if (existing !== null) {
    res = await fetch(`${API_BASE}/repos/${repo}/issues/comments/${existing.id}`, {
      method: 'PATCH',
      headers: hdrs,
      body: JSON.stringify({ body }),
    });
  } else {
    res = await fetch(`${API_BASE}/repos/${repo}/issues/${prNumber}/comments`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({ body }),
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to post PR comment (${res.status}): ${text}`);
  }
}

export async function hidePrComment(prNumber: string, repo?: string): Promise<void> {
  if (!prNumber || !repo) return;

  let t: string;
  try {
    t = resolveToken();
  } catch {
    return;
  }

  const existing = await findExistingComment(prNumber, repo, t);
  if (!existing) return;

  await fetch(`${API_BASE}/graphql`, {
    method: 'POST',
    headers: githubHeaders(t),
    body: JSON.stringify({
      query: `mutation MinimizeComment($id: ID!) {
        minimizeComment(input: { subjectId: $id, classifier: OUTDATED }) {
          minimizedComment { isMinimized }
        }
      }`,
      variables: { id: existing.nodeId },
    }),
  });
}
