import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GithubApiError,
  GithubGraphqlError,
  getPrShas,
  ghFileAtSha,
  ghLsTree,
} from '../../src/sources/github.js';

function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers: extraHeaders });
}

function textResponse(
  status: number,
  body: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers: extraHeaders });
}

function graphqlBody(options: RequestInit): Record<string, unknown> {
  return JSON.parse(options.body as string);
}

function isGraphqlCall(call: unknown[]): boolean {
  return String(call[0]).endsWith('/graphql');
}

describe('github source', () => {
  const originalToken = process.env.GITHUB_TOKEN;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'test-token';
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env.GITHUB_TOKEN = originalToken;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('ghFileAtSha', () => {
    it('returns null when the batched query resolves the path to a non-Blob (not found)', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { data: { r0: { f0: null } } }));
      await expect(ghFileAtSha('sha', 'missing.lock', 'org/repo')).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(isGraphqlCall(fetchMock.mock.calls[0])).toBe(true);
    });

    it('returns the blob text when found', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          data: {
            r0: { f0: { __typename: 'Blob', text: 'lockfile contents', isTruncated: false } },
          },
        }),
      );
      await expect(ghFileAtSha('sha', 'lock.file', 'org/repo')).resolves.toBe('lockfile contents');
    });

    it('batches concurrent calls into a single GraphQL request', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          data: {
            r0: {
              f0: { __typename: 'Blob', text: 'base content', isTruncated: false },
              f1: { __typename: 'Blob', text: 'head content', isTruncated: false },
              f2: null,
            },
          },
        }),
      );

      const results = await Promise.all([
        ghFileAtSha('base-sha', 'lock.file', 'org/repo'),
        ghFileAtSha('head-sha', 'lock.file', 'org/repo'),
        ghFileAtSha('head-sha', 'missing.file', 'org/repo'),
      ]);

      expect(results).toEqual(['base content', 'head content', null]);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const body = graphqlBody(fetchMock.mock.calls[0][1] as RequestInit);
      const variables = body.variables as Record<string, string>;
      expect(variables.e0_0).toBe('base-sha:lock.file');
      expect(variables.e0_1).toBe('head-sha:lock.file');
      expect(variables.e0_2).toBe('head-sha:missing.file');
    });

    it('falls back to the REST raw endpoint when the blob is truncated', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url.endsWith('/graphql')) {
          return Promise.resolve(
            jsonResponse(200, {
              data: { r0: { f0: { __typename: 'Blob', text: 'partial...', isTruncated: true } } },
            }),
          );
        }
        return Promise.resolve(textResponse(200, 'full content via REST'));
      });

      await expect(ghFileAtSha('sha', 'big.lock', 'org/repo')).resolves.toBe(
        'full content via REST',
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(isGraphqlCall(fetchMock.mock.calls[0])).toBe(true);
      expect(String(fetchMock.mock.calls[1][0])).toContain('/contents/big.lock');
    });

    it('retries the REST fallback on a transient error before giving up', async () => {
      let restCalls = 0;
      fetchMock.mockImplementation((url: string) => {
        if (url.endsWith('/graphql')) {
          return Promise.resolve(
            jsonResponse(200, {
              data: { r0: { f0: { __typename: 'Blob', text: 'partial...', isTruncated: true } } },
            }),
          );
        }
        restCalls++;
        if (restCalls === 1) return Promise.resolve(textResponse(500, 'transient'));
        return Promise.resolve(textResponse(200, 'full content via REST'));
      });

      const promise = ghFileAtSha('sha', 'big.lock', 'org/repo');
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe('full content via REST');
      expect(restCalls).toBe(2);
    });

    it('does not retry the REST fallback on a non-retryable 404', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url.endsWith('/graphql')) {
          return Promise.resolve(
            jsonResponse(200, {
              data: { r0: { f0: { __typename: 'Blob', text: 'partial...', isTruncated: true } } },
            }),
          );
        }
        return Promise.resolve(textResponse(404, 'gone by the time REST fetched it'));
      });

      await expect(ghFileAtSha('sha', 'big.lock', 'org/repo')).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('rejects every batched call when the GraphQL request returns a hard error', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { errors: [{ type: 'FORBIDDEN', message: 'nope' }] }),
      );

      const results = await Promise.allSettled([
        ghFileAtSha('sha', 'a.lock', 'org/repo'),
        ghFileAtSha('sha', 'b.lock', 'org/repo'),
      ]);

      expect(results[0].status).toBe('rejected');
      expect(results[1].status).toBe('rejected');
      expect((results[0] as PromiseRejectedResult).reason).toBeInstanceOf(GithubGraphqlError);
    });

    it('retries when GraphQL responds 200 with a RATE_LIMITED body error, then succeeds', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, { errors: [{ type: 'RATE_LIMITED', message: 'slow down' }] }),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, {
            data: { r0: { f0: { __typename: 'Blob', text: 'ok', isTruncated: false } } },
          }),
        );

      const promise = ghFileAtSha('sha', 'lock.file', 'org/repo');
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe('ok');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('throws GithubApiError when the GraphQL HTTP call itself fails after retries', async () => {
      fetchMock.mockResolvedValue(textResponse(500, 'oops'));
      const promise = ghFileAtSha('sha', 'lock.file', 'org/repo');
      const assertion = expect(promise).rejects.toThrow(GithubApiError);
      await vi.runAllTimersAsync();
      await assertion;
    });

    it('splits very large batches into multiple GraphQL requests', async () => {
      fetchMock.mockImplementation((_url: string, options: RequestInit) => {
        const { variables } = graphqlBody(options) as { variables: Record<string, string> };
        const exprKeys = Object.keys(variables).filter((k) => k.startsWith('e0_'));
        const fields = Object.fromEntries(
          exprKeys.map((k) => {
            const fieldIndex = k.split('_')[1];
            return [
              `f${fieldIndex}`,
              { __typename: 'Blob', text: variables[k], isTruncated: false },
            ];
          }),
        );
        return Promise.resolve(jsonResponse(200, { data: { r0: fields } }));
      });

      const paths = Array.from({ length: 101 }, (_, i) => `pkg-${i}.lock`);
      const results = await Promise.all(paths.map((p) => ghFileAtSha('sha', p, 'org/repo')));

      expect(results).toEqual(paths.map((p) => `sha:${p}`));
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('ghLsTree', () => {
    it('returns [] on a 404', async () => {
      fetchMock.mockResolvedValue(textResponse(404, 'not found'));
      await expect(ghLsTree('sha', 'org/repo')).resolves.toEqual([]);
    });

    it('throws instead of treating a server error as an empty tree', async () => {
      fetchMock.mockResolvedValue(textResponse(502, 'bad gateway'));
      const promise = ghLsTree('sha', 'org/repo');
      const assertion = expect(promise).rejects.toThrow(GithubApiError);
      await vi.runAllTimersAsync();
      await assertion;
    });

    it('returns blob paths on success', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          tree: [
            { path: 'a.lock', type: 'blob' },
            { path: 'dir', type: 'tree' },
          ],
          truncated: false,
        }),
      );
      await expect(ghLsTree('sha', 'org/repo')).resolves.toEqual(['a.lock']);
    });
  });

  describe('getPrShas', () => {
    function mockPrLookup(response: Record<string, unknown>) {
      fetchMock.mockImplementation((url: string) => {
        if (url.endsWith('/graphql')) return Promise.resolve(jsonResponse(200, response));
        throw new Error(`unexpected REST call in this test: ${url}`);
      });
    }

    it('resolves the merge-base via the REST compare endpoint', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url.endsWith('/graphql')) {
          return Promise.resolve(
            jsonResponse(200, {
              data: {
                repository: { pullRequest: { baseRefOid: 'base-sha', headRefOid: 'head-sha' } },
              },
            }),
          );
        }
        expect(url).toContain('/compare/base-sha...head-sha');
        return Promise.resolve(jsonResponse(200, { merge_base_commit: { sha: 'merge-base-sha' } }));
      });

      await expect(getPrShas('42', 'org/repo')).resolves.toEqual({
        baseRefOid: 'merge-base-sha',
        headRefOid: 'head-sha',
      });
    });

    it('falls back to base.sha when the compare call fails', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url.endsWith('/graphql')) {
          return Promise.resolve(
            jsonResponse(200, {
              data: {
                repository: { pullRequest: { baseRefOid: 'base-sha', headRefOid: 'head-sha' } },
              },
            }),
          );
        }
        return Promise.resolve(textResponse(500, 'compare unavailable'));
      });

      const promise = getPrShas('42', 'org/repo');
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toEqual({
        baseRefOid: 'base-sha',
        headRefOid: 'head-sha',
      });
    });

    it('throws GithubApiError(404) for a nonexistent PR (partial NOT_FOUND response)', async () => {
      mockPrLookup({
        data: { repository: { pullRequest: null } },
        errors: [{ type: 'NOT_FOUND', message: 'Could not resolve to a PullRequest' }],
      });

      const promise = getPrShas('999999', 'org/repo');
      await expect(promise).rejects.toThrow(GithubApiError);
      await promise.catch((err) => expect((err as GithubApiError).status).toBe(404));
    });

    it('throws GithubGraphqlError on a non-NOT_FOUND GraphQL error', async () => {
      mockPrLookup({ errors: [{ type: 'FORBIDDEN', message: 'no access' }] });
      await expect(getPrShas('42', 'org/repo')).rejects.toThrow(GithubGraphqlError);
    });
  });
});
