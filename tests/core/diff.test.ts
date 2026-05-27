import { describe, expect, it } from 'vitest';
import { diffPackages } from '../../src/core/diff.js';
import { normalizePythonName } from '../../src/ecosystems/python/pyproject.js';
import { directDeps } from '../helpers.js';

const norm = normalizePythonName;

describe('diffPackages', () => {
  it('returns empty array when lockfiles are identical', () => {
    const pkgs = { requests: '2.31.0', certifi: '2024.1.1' };
    expect(diffPackages(pkgs, pkgs, directDeps([]), norm)).toEqual([]);
  });

  it('detects added package', () => {
    const changes = diffPackages({}, { httpx: '0.27.0' }, directDeps([]), norm);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      name: 'httpx',
      change_type: 'added',
      old_version: null,
      new_version: '0.27.0',
      is_direct: false,
      is_dev: false,
    });
  });

  it('detects removed package', () => {
    const changes = diffPackages({ urllib3: '1.26.15' }, {}, directDeps([]), norm);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      name: 'urllib3',
      change_type: 'removed',
      old_version: '1.26.15',
      new_version: null,
      is_direct: false,
      is_dev: false,
    });
  });

  it('detects updated package', () => {
    const changes = diffPackages(
      { requests: '2.31.0' },
      { requests: '2.32.3' },
      directDeps([]),
      norm,
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      name: 'requests',
      change_type: 'updated',
      old_version: '2.31.0',
      new_version: '2.32.3',
    });
  });

  it('marks direct prod dependencies correctly', () => {
    const changes = diffPackages(
      { requests: '2.31.0', urllib3: '2.2.1' },
      { requests: '2.32.3', urllib3: '2.2.2' },
      directDeps(['requests', 'django']),
      norm,
    );
    const byName = Object.fromEntries(changes.map((c) => [c.name, c]));
    expect(byName.requests.is_direct).toBe(true);
    expect(byName.requests.is_dev).toBe(false);
    expect(byName.urllib3.is_direct).toBe(false);
    expect(byName.urllib3.is_dev).toBe(false);
  });

  it('marks dev dependencies correctly', () => {
    const changes = diffPackages(
      { pytest: '8.0.0', urllib3: '2.2.1' },
      { pytest: '8.1.0', urllib3: '2.2.2' },
      directDeps([], ['pytest']),
      norm,
    );
    const byName = Object.fromEntries(changes.map((c) => [c.name, c]));
    expect(byName.pytest.is_direct).toBe(true);
    expect(byName.pytest.is_dev).toBe(true);
    expect(byName.urllib3.is_direct).toBe(false);
    expect(byName.urllib3.is_dev).toBe(false);
  });

  it('handles name normalization for direct dep matching', () => {
    const changes = diffPackages({}, { 'my-package': '1.0.0' }, directDeps(['my_package']), norm);
    expect(changes[0].is_direct).toBe(true);
  });

  it('returns changes sorted alphabetically by package name', () => {
    const changes = diffPackages(
      { zebra: '1.0', apple: '1.0' },
      { zebra: '2.0', banana: '1.0', apple: '2.0' },
      directDeps([]),
      norm,
    );
    const names = changes.map((c) => c.name);
    expect(names).toEqual([...names].sort());
  });

  it('handles multiple change types in one diff', () => {
    const base = { requests: '2.31.0', old_dep: '1.0.0', stable: '5.0.0' };
    const head = { requests: '2.32.3', new_dep: '2.0.0', stable: '5.0.0' };
    const changes = diffPackages(base, head, directDeps(['requests']), norm);

    const byName = Object.fromEntries(changes.map((c) => [c.name, c]));
    expect(byName.requests.change_type).toBe('updated');
    expect(byName.old_dep.change_type).toBe('removed');
    expect(byName.new_dep.change_type).toBe('added');
    expect('stable' in byName).toBe(false);
    expect(changes).toHaveLength(3);
  });
});
