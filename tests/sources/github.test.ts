import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubApiError, ghFileAtSha, ghLsTree } from '../../src/sources/github.js';

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

describe('github source error handling', () => {
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

  it('ghFileAtSha returns null on a 404 (file genuinely absent)', async () => {
    fetchMock.mockResolvedValue(textResponse(404, 'not found'));
    await expect(ghFileAtSha('sha', 'lock.file', 'org/repo')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ghFileAtSha throws instead of treating a rate-limited response as not-found', async () => {
    fetchMock.mockResolvedValue(
      textResponse(403, 'rate limited', { 'x-ratelimit-remaining': '0' }),
    );
    const promise = ghFileAtSha('sha', 'lock.file', 'org/repo');
    const assertion = expect(promise).rejects.toThrow(GithubApiError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('ghFileAtSha retries on a transient 500 then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(textResponse(500, 'oops'))
      .mockResolvedValueOnce(textResponse(200, 'lockfile contents'));
    const promise = ghFileAtSha('sha', 'lock.file', 'org/repo');
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('lockfile contents');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ghFileAtSha throws after exhausting retries on persistent 429', async () => {
    fetchMock.mockResolvedValue(textResponse(429, 'too many requests'));
    const promise = ghFileAtSha('sha', 'lock.file', 'org/repo');
    const assertion = expect(promise).rejects.toThrow(GithubApiError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock.mock.calls.length).toBe(4);
  });

  it('ghFileAtSha does not retry a non-retryable 4xx (e.g. 401)', async () => {
    fetchMock.mockResolvedValue(textResponse(401, 'bad credentials'));
    await expect(ghFileAtSha('sha', 'lock.file', 'org/repo')).rejects.toThrow(GithubApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ghLsTree returns [] on a 404', async () => {
    fetchMock.mockResolvedValue(textResponse(404, 'not found'));
    await expect(ghLsTree('sha', 'org/repo')).resolves.toEqual([]);
  });

  it('ghLsTree throws instead of treating a server error as an empty tree', async () => {
    fetchMock.mockResolvedValue(textResponse(502, 'bad gateway'));
    const promise = ghLsTree('sha', 'org/repo');
    const assertion = expect(promise).rejects.toThrow(GithubApiError);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('ghLsTree returns blob paths on success', async () => {
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
