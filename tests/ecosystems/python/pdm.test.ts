import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parseTomlPackages } from '../../../src/ecosystems/python/parsers/toml.js';
import { diffPackages } from '../../../src/core/diff.js';
import { normalizePythonName } from '../../../src/ecosystems/python/pyproject.js';
import { directDeps } from '../../helpers.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/python/pdm', name), 'utf-8');

describe('pdm.lock parser', () => {
  it('parses packages from base lockfile', () => {
    const pkgs = parseTomlPackages(fixture('simple-base.lock'));
    expect(pkgs['fastapi']).toBe('0.110.0');
    expect(pkgs['pydantic']).toBe('2.6.4');
    expect(pkgs['starlette']).toBe('0.36.3');
    expect(pkgs['uvicorn']).toBe('0.29.0');
    expect(Object.keys(pkgs)).toHaveLength(4);
  });

  it('parses packages from head lockfile', () => {
    const pkgs = parseTomlPackages(fixture('simple-head.lock'));
    expect(pkgs['fastapi']).toBe('0.111.0');
    expect(pkgs['pydantic-settings']).toBe('2.2.1');
    expect(Object.keys(pkgs)).toHaveLength(5);
  });

  it('produces correct diff', () => {
    const base = parseTomlPackages(fixture('simple-base.lock'));
    const head = parseTomlPackages(fixture('simple-head.lock'));
    const changes = diffPackages(base, head, directDeps(['fastapi', 'pydantic']), normalizePythonName);
    const byName = Object.fromEntries(changes.map((c) => [c.name, c]));

    expect(byName['fastapi'].change_type).toBe('updated');
    expect(byName['fastapi'].is_direct).toBe(true);
    expect(byName['pydantic'].change_type).toBe('updated');
    expect(byName['pydantic'].is_direct).toBe(true);
    expect(byName['starlette'].change_type).toBe('updated');
    expect(byName['starlette'].is_direct).toBe(false);
    expect(byName['pydantic-settings'].change_type).toBe('added');
    expect(byName['uvicorn']).toBeUndefined();
  });
});
