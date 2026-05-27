import { describe, expect, it } from 'vitest';
import { resolveLockfilePair } from '../../../src/core/discovery.js';
import type { LockfileInfo } from '../../../src/core/discovery.js';

describe('lockfile migration detection', () => {
  const uvLock: LockfileInfo = { path: 'uv.lock', type: 'uv', ecosystemName: 'python' };
  const poetryLock: LockfileInfo = { path: 'poetry.lock', type: 'poetry', ecosystemName: 'python' };
  const pdmLock: LockfileInfo = { path: 'pdm.lock', type: 'pdm', ecosystemName: 'python' };

  it('returns null when no lockfiles exist on either side', () => {
    expect(resolveLockfilePair([], [])).toBeNull();
  });

  it('detects a stable lockfile (same path at base and head)', () => {
    const pair = resolveLockfilePair([uvLock], [uvLock]);
    expect(pair).not.toBeNull();
    expect(pair?.migrationNote).toBeNull();
    expect(pair?.basePath).toBe('uv.lock');
    expect(pair?.headPath).toBe('uv.lock');
  });

  it('detects poetry → uv migration', () => {
    const pair = resolveLockfilePair([poetryLock], [uvLock]);
    expect(pair).not.toBeNull();
    expect(pair?.migrationNote).toContain('lockfile migration');
    expect(pair?.migrationNote).toContain('poetry');
    expect(pair?.migrationNote).toContain('uv');
    expect(pair?.basePath).toBe('poetry.lock');
    expect(pair?.headPath).toBe('uv.lock');
  });

  it('detects pdm → uv migration', () => {
    const pair = resolveLockfilePair([pdmLock], [uvLock]);
    expect(pair?.migrationNote).toContain('lockfile migration');
    expect(pair?.baseType).toBe('pdm');
    expect(pair?.headType).toBe('uv');
  });

  it('detects new lockfile added', () => {
    const pair = resolveLockfilePair([], [uvLock]);
    expect(pair?.migrationNote).toContain('new lockfile added');
    expect(pair?.basePath).toBeNull();
    expect(pair?.headPath).toBe('uv.lock');
  });

  it('detects lockfile removed', () => {
    const pair = resolveLockfilePair([poetryLock], []);
    expect(pair?.migrationNote).toContain('lockfile removed');
    expect(pair?.basePath).toBe('poetry.lock');
    expect(pair?.headPath).toBeNull();
  });

  it('prefers uv.lock over poetry.lock when both exist at same ref', () => {
    const pair = resolveLockfilePair([poetryLock, uvLock], [poetryLock, uvLock]);
    expect(pair?.basePath).toBe('uv.lock');
    expect(pair?.headPath).toBe('uv.lock');
    expect(pair?.migrationNote).toBeNull();
  });

  it('handles monorepo paths correctly', () => {
    const base: LockfileInfo = {
      path: 'services/api/uv.lock',
      type: 'uv',
      ecosystemName: 'python',
    };
    const head: LockfileInfo = {
      path: 'services/api/uv.lock',
      type: 'uv',
      ecosystemName: 'python',
    };
    const pair = resolveLockfilePair([base], [head]);
    expect(pair?.migrationNote).toBeNull();
    expect(pair?.basePath).toBe('services/api/uv.lock');
  });
});
