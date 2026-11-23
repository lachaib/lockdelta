import { describe, expect, it } from 'vitest';
import '../../src/ecosystems/index.js';
import { collectLockfileEntries } from '../../src/core/report.js';

const npmLock = (version: string) =>
  JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'app' },
      'node_modules/lodash': { version },
    },
  });

const composerLock = (version: string) =>
  JSON.stringify({ packages: [{ name: 'laravel/framework', version }], 'packages-dev': [] });

describe('collectLockfileEntries', () => {
  it('diffs every ecosystem present in the same directory', async () => {
    const base: Record<string, string> = {
      'package-lock.json': npmLock('4.17.20'),
      'composer.lock': composerLock('10.0.0'),
    };
    const head: Record<string, string> = {
      'package-lock.json': npmLock('4.17.21'),
      'composer.lock': composerLock('10.0.0'),
    };
    const entries = await collectLockfileEntries({
      getBase: async (p) => base[p] ?? null,
      getHead: async (p) => head[p] ?? null,
      allBasePaths: Object.keys(base),
      allHeadPaths: Object.keys(head),
    });
    expect(entries.map((e) => e.ecosystem).sort()).toEqual(['javascript', 'php']);
    expect(entries.find((e) => e.ecosystem === 'javascript')?.summary.updated).toBe(1);
  });
});
