import { describe, expect, it } from 'vitest';
import { GithubApiError, getPrShas, ghFileAtSha } from '../../src/sources/github.js';

/**
 * Opt-in smoke test against the real GitHub API — verifies the GraphQL migration behaves as
 * GitHub actually responds, not just as mocks assume (e.g. NOT_FOUND partial errors on PR
 * lookups, batched blob queries). Skipped by default; run with:
 *   GITHUB_TOKEN=$(gh auth token) LIVE_GITHUB_TEST=1 pnpm vitest run tests/sources/github.live.test.ts
 */
const repo = 'lachaib/lockdelta';

describe.skipIf(!process.env.LIVE_GITHUB_TEST)('github source (live API)', () => {
  it('getPrShas resolves a real PR via GraphQL + REST compare', async () => {
    const shas = await getPrShas('23', repo);
    expect(shas.baseRefOid).toMatch(/^[0-9a-f]{40}$/);
    expect(shas.headRefOid).toMatch(/^[0-9a-f]{40}$/);
  });

  it('getPrShas throws GithubApiError(404) for a nonexistent PR', async () => {
    const promise = getPrShas('999999', repo);
    await expect(promise).rejects.toThrow(GithubApiError);
    await promise.catch((err) => expect((err as GithubApiError).status).toBe(404));
  });

  it('batches concurrent ghFileAtSha calls into one query, including a missing path', async () => {
    const shas = await getPrShas('23', repo);
    const [pkg, readme, missing] = await Promise.all([
      ghFileAtSha(shas.headRefOid, 'package.json', repo),
      ghFileAtSha(shas.headRefOid, 'README.md', repo),
      ghFileAtSha(shas.headRefOid, 'does/not/exist.json', repo),
    ]);
    expect(pkg).toContain('"name": "lockdelta"');
    expect(readme?.length).toBeGreaterThan(0);
    expect(missing).toBeNull();
  });
});
