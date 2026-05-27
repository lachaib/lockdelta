import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parseTomlPackages } from '../../../src/ecosystems/python/parsers/toml.js';
import { diffPackages } from '../../../src/core/diff.js';
import { normalizePythonName } from '../../../src/ecosystems/python/pyproject.js';
import { directDeps } from '../../helpers.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/python/pylock', name), 'utf-8');

describe('pylock.toml parser (PEP 751)', () => {
  it('parses [[packages]] sections from base lockfile', () => {
    const pkgs = parseTomlPackages(fixture('simple-base.toml'));
    expect(pkgs['requests']).toBe('2.31.0');
    expect(pkgs['certifi']).toBe('2024.2.2');
    expect(pkgs['urllib3']).toBe('2.2.1');
    expect(pkgs['idna']).toBe('3.6');
    expect(pkgs['charset-normalizer']).toBe('3.3.2');
    expect(Object.keys(pkgs)).toHaveLength(5);
  });

  it('parses [[packages]] sections from head lockfile', () => {
    const pkgs = parseTomlPackages(fixture('simple-head.toml'));
    expect(pkgs['requests']).toBe('2.32.3');
    expect(pkgs['httpx']).toBe('0.27.0');
    expect(pkgs['httpcore']).toBe('1.0.5');
    expect(Object.keys(pkgs)).toHaveLength(7);
  });

  it('produces correct diff between base and head', () => {
    const base = parseTomlPackages(fixture('simple-base.toml'));
    const head = parseTomlPackages(fixture('simple-head.toml'));
    const changes = diffPackages(base, head, directDeps(['requests', 'httpx']), normalizePythonName);
    const byName = Object.fromEntries(changes.map((c) => [c.name, c]));

    expect(byName['requests'].change_type).toBe('updated');
    expect(byName['requests'].old_version).toBe('2.31.0');
    expect(byName['requests'].new_version).toBe('2.32.3');
    expect(byName['requests'].is_direct).toBe(true);

    expect(byName['certifi'].change_type).toBe('updated');
    expect(byName['certifi'].is_direct).toBe(false);

    expect(byName['idna'].change_type).toBe('updated');
    expect(byName['urllib3'].change_type).toBe('updated');

    expect(byName['httpx'].change_type).toBe('added');
    expect(byName['httpx'].is_direct).toBe(true);
    expect(byName['httpcore'].change_type).toBe('added');
  });

  it('is registered in the python ecosystem', async () => {
    const { pythonEcosystem } = await import('../../../src/ecosystems/python/index.js');
    expect(pythonEcosystem.getLockfileType('pylock.toml')).toBe('pylock');
  });

  it('existing [[package]] lockfiles still parse correctly after the change', () => {
    const uvContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "requests"
version = "2.31.0"

[[package]]
name = "certifi"
version = "2024.2.2"
`.trim();
    const pkgs = parseTomlPackages(uvContent);
    expect(pkgs['requests']).toBe('2.31.0');
    expect(pkgs['certifi']).toBe('2024.2.2');
  });
});
