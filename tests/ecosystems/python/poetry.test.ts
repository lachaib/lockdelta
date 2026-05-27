import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parseTomlPackages } from '../../../src/ecosystems/python/parsers/toml.js';
import { diffPackages } from '../../../src/core/diff.js';
import { normalizePythonName } from '../../../src/ecosystems/python/pyproject.js';
import { directDeps } from '../../helpers.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/python/poetry', name), 'utf-8');

describe('poetry.lock parser', () => {
  it('parses all packages from a simple base lockfile', () => {
    const pkgs = parseTomlPackages(fixture('simple-base.lock'));
    expect(pkgs['requests']).toBe('2.28.2');
    expect(pkgs['urllib3']).toBe('1.26.15');
    expect(pkgs['certifi']).toBe('2023.7.22');
    expect(pkgs['charset-normalizer']).toBe('3.2.0');
    expect(Object.keys(pkgs)).toHaveLength(4);
  });

  it('parses all packages from head lockfile', () => {
    const pkgs = parseTomlPackages(fixture('simple-head.lock'));
    expect(pkgs['requests']).toBe('2.31.0');
    expect(pkgs['urllib3']).toBe('2.0.7');
    expect(pkgs['idna']).toBe('3.6');
    expect(Object.keys(pkgs)).toHaveLength(5);
  });

  it('produces correct diff between base and head', () => {
    const base = parseTomlPackages(fixture('simple-base.lock'));
    const head = parseTomlPackages(fixture('simple-head.lock'));
    const changes = diffPackages(base, head, directDeps(['requests']), normalizePythonName);

    const byName = Object.fromEntries(changes.map((c) => [c.name, c]));

    expect(byName['requests'].change_type).toBe('updated');
    expect(byName['requests'].old_version).toBe('2.28.2');
    expect(byName['requests'].new_version).toBe('2.31.0');
    expect(byName['requests'].is_direct).toBe(true);

    expect(byName['urllib3'].change_type).toBe('updated');
    expect(byName['urllib3'].is_direct).toBe(false);

    expect(byName['certifi'].change_type).toBe('updated');
    expect(byName['idna'].change_type).toBe('added');
    expect(byName['idna'].is_direct).toBe(false);

    // certifi and charset-normalizer also changed between base and head
    expect(byName['certifi'].change_type).toBe('updated');
    expect(byName['charset-normalizer'].change_type).toBe('updated');

    expect(changes).toHaveLength(5);
  });

  it('ignores [metadata] section entries — only [[package]] blocks are packages', () => {
    const pkgs = parseTomlPackages(fixture('simple-base.lock'));
    expect('metadata' in pkgs).toBe(false);
    expect('lock-version' in pkgs).toBe(false);
  });
});
