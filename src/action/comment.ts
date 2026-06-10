import { getOctokit } from '@actions/github';
import { resolveToken } from '../sources/github.js';

const MARKER = '<!-- lockdelta -->';

type Octokit = ReturnType<typeof getOctokit>;

function splitRepo(repo: string): { owner: string; repoName: string } {
  const [owner, repoName] = repo.split('/');
  return { owner, repoName };
}

async function findExistingComment(
  prNumber: number,
  owner: string,
  repoName: string,
  octokit: Octokit,
): Promise<{ id: number; nodeId: string } | null> {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo: repoName,
    issue_number: prNumber,
    per_page: 100,
  });
  const found = comments.find((c) => c.body?.includes(MARKER));
  return found ? { id: found.id, nodeId: found.node_id } : null;
}

export async function postPrComment(
  markdown: string,
  prNumber: string,
  repo?: string,
): Promise<void> {
  if (!prNumber) throw new Error('post-comment requires a PR number');
  if (!repo) throw new Error('post-comment requires repo to be set');

  const octokit = getOctokit(resolveToken());
  const { owner, repoName } = splitRepo(repo);
  const body = `${MARKER}\n\n${markdown}`;
  const prNum = Number(prNumber);

  const existing = await findExistingComment(prNum, owner, repoName, octokit);

  if (existing !== null) {
    await octokit.rest.issues.updateComment({
      owner,
      repo: repoName,
      comment_id: existing.id,
      body,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo: repoName,
      issue_number: prNum,
      body,
    });
  }
}

export async function hidePrComment(prNumber: string, repo?: string): Promise<void> {
  if (!prNumber || !repo) return;

  let token: string;
  try {
    token = resolveToken();
  } catch {
    return;
  }

  const octokit = getOctokit(token);
  const { owner, repoName } = splitRepo(repo);
  const existing = await findExistingComment(Number(prNumber), owner, repoName, octokit);
  if (!existing) return;

  await octokit.graphql(
    `mutation MinimizeComment($id: ID!) {
      minimizeComment(input: { subjectId: $id, classifier: OUTDATED }) {
        minimizedComment { isMinimized }
      }
    }`,
    { id: existing.nodeId },
  );
}
