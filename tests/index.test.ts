import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from '../src/index.js';

const fixture = (name: string) => join(import.meta.dirname, 'fixtures/python/uv', name);

describe('run — local file mode (--old/--new)', () => {
  let dir: string;
  let oldPath: string;
  let newPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lockdelta-'));
    oldPath = join(dir, 'uv.lock.old');
    newPath = join(dir, 'uv.lock');
    copyFileSync(fixture('simple-base.lock'), oldPath);
    copyFileSync(fixture('simple-head.lock'), newPath);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('matches packages across files and reports updates', async () => {
    const report = await run({ oldFile: oldPath, newFile: newPath });

    expect(report.summary).toMatchObject({ added: 2, removed: 0, updated: 2 });
    const [lockfile] = report.lockfiles;
    expect(lockfile.type).toBe('uv');
    expect(lockfile.changes).toContainEqual(
      expect.objectContaining({
        name: 'requests',
        change_type: 'updated',
        old_version: '2.31.0',
        new_version: '2.32.3',
      }),
    );
  });

  it('reads direct deps from the manifest next to the new lockfile', async () => {
    writeFileSync(
      join(dir, 'pyproject.toml'),
      '[project]\nname = "demo"\ndependencies = ["requests>=2", "httpx"]\n',
    );

    const report = await run({ oldFile: oldPath, newFile: newPath });
    const direct = report.lockfiles[0].changes.filter((c) => c.is_direct).map((c) => c.name);

    expect(direct.sort()).toEqual(['httpx', 'requests']);
  });

  it('uses --type when neither filename is recognized', async () => {
    const renamed = join(dir, 'uv.lock.new');
    copyFileSync(newPath, renamed);

    await expect(run({ oldFile: oldPath, newFile: renamed })).rejects.toThrow(/use --type/);

    const report = await run({ oldFile: oldPath, newFile: renamed, lockfileType: 'uv' });
    expect(report.summary.updated).toBe(2);
  });
});
