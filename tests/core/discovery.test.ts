import { describe, expect, it } from 'vitest';
import {
  detectLockfileInfo,
  findAllLockfiles,
  findLockfiles,
  groupByWorkspace,
  workspaceFromPath,
} from '../../src/core/discovery.js';

describe('workspaceFromPath', () => {
  it('returns "." for root-level paths', () => {
    expect(workspaceFromPath('uv.lock')).toBe('.');
    expect(workspaceFromPath('./uv.lock')).toBe('.');
  });

  it('returns parent directory for nested paths', () => {
    expect(workspaceFromPath('packages/backend/uv.lock')).toBe('packages/backend');
    expect(workspaceFromPath('services/api/poetry.lock')).toBe('services/api');
  });
});

describe('detectLockfileInfo', () => {
  it('detects uv.lock', () => {
    const info = detectLockfileInfo('uv.lock');
    expect(info).toMatchObject({ path: 'uv.lock', type: 'uv', ecosystemName: 'python' });
  });

  it('detects poetry.lock', () => {
    const info = detectLockfileInfo('poetry.lock');
    expect(info).toMatchObject({ type: 'poetry', ecosystemName: 'python' });
  });

  it('detects pdm.lock', () => {
    const info = detectLockfileInfo('pdm.lock');
    expect(info).toMatchObject({ type: 'pdm', ecosystemName: 'python' });
  });

  it('detects nested lockfile paths', () => {
    const info = detectLockfileInfo('packages/backend/uv.lock');
    expect(info).toMatchObject({ path: 'packages/backend/uv.lock', type: 'uv' });
  });

  it('returns null for unsupported lockfiles', () => {
    expect(detectLockfileInfo('Gemfile.lock')).toBeNull();
    expect(detectLockfileInfo('Cargo.lock')).toBeNull();
    expect(detectLockfileInfo('composer.lock')).toBeNull();
    expect(detectLockfileInfo('go.sum')).toBeNull();
  });
});

describe('findAllLockfiles', () => {
  it('filters known lockfiles from a list of paths', () => {
    const paths = [
      'src/index.ts',
      'uv.lock',
      'pyproject.toml',
      'packages/frontend/package.json',
      'packages/backend/poetry.lock',
      'README.md',
    ];
    const found = findAllLockfiles(paths);
    expect(found).toHaveLength(2);
    expect(found.map((f) => f.path)).toContain('uv.lock');
    expect(found.map((f) => f.path)).toContain('packages/backend/poetry.lock');
  });
});

describe('groupByWorkspace', () => {
  it('groups lockfiles by their parent directory', () => {
    const lockfiles = [
      { path: 'uv.lock', type: 'uv', ecosystemName: 'python' },
      { path: 'services/api/uv.lock', type: 'uv', ecosystemName: 'python' },
      { path: 'services/worker/poetry.lock', type: 'poetry', ecosystemName: 'python' },
    ];
    const grouped = groupByWorkspace(lockfiles);
    expect(grouped.size).toBe(3);
    expect(grouped.get('.')?.map((l) => l.path)).toEqual(['uv.lock']);
    expect(grouped.get('services/api')?.map((l) => l.path)).toEqual(['services/api/uv.lock']);
    expect(grouped.get('services/worker')?.map((l) => l.path)).toEqual([
      'services/worker/poetry.lock',
    ]);
  });
});

describe('findLockfiles (probe root-level)', () => {
  it('returns lockfiles found via getFile function', async () => {
    const getFile = async (path: string): Promise<string | null> => {
      if (path === 'uv.lock') return 'version = 1\n';
      return null;
    };
    const found = await findLockfiles(getFile);
    expect(found).toHaveLength(1);
    expect(found[0].path).toBe('uv.lock');
    expect(found[0].type).toBe('uv');
  });

  it('returns empty when no lockfiles exist', async () => {
    expect(await findLockfiles(async () => null)).toEqual([]);
  });

  it('can find multiple lockfiles at root', async () => {
    const getFile = async (path: string): Promise<string | null> => {
      if (path === 'uv.lock' || path === 'poetry.lock') return 'content';
      return null;
    };
    const found = await findLockfiles(getFile);
    expect(found.map((f) => f.path)).toContain('uv.lock');
    expect(found.map((f) => f.path)).toContain('poetry.lock');
  });
});
