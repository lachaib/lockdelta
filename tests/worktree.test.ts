import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from '../src/index.js';

const fixture = (name: string) => join(import.meta.dirname, 'fixtures/python/uv', name);
const git = (...args: string[]) => execFileSync('git', args, { stdio: 'pipe' });

describe('run — worktree mode', () => {
  const originalCwd = process.cwd();
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lockdelta-wt-'));
    process.chdir(dir);
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    copyFileSync(fixture('simple-base.lock'), 'uv.lock');
    git('add', 'uv.lock');
    git('commit', '-q', '-m', 'init');
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('diffs HEAD against the uncommitted lockfile', async () => {
    copyFileSync(fixture('simple-head.lock'), 'uv.lock');

    const report = await run({ worktree: true });

    expect(report.base_ref).toBe('HEAD');
    expect(report.head_ref).toBe('worktree');
    expect(report.summary).toMatchObject({ added: 2, removed: 0, updated: 2 });
  });

  it('picks up an untracked lockfile', async () => {
    copyFileSync(fixture('simple-head.lock'), 'poetry.lock');
    unlinkSync('uv.lock');

    const report = await run({ worktree: true });

    expect(report.lockfiles[0].migration?.note).toMatch(/uv\.lock.*poetry\.lock/);
  });

  it('reports no changes on a clean tree', async () => {
    const report = await run({ worktree: true });

    expect(report.summary.total_changes).toBe(0);
  });
});
