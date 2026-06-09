import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffPackages } from '../../../src/core/diff.js';
import { parseTomlPackages } from '../../../src/ecosystems/python/parsers/toml.js';
import { normalizePythonName } from '../../../src/ecosystems/python/pyproject.js';
import { directDeps } from '../../helpers.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/python/pdm', name), 'utf-8');

describe('pdm.lock parser', () => {
  it('parses packages from base lockfile', () => {
    const pkgs = parseTomlPackages(fixture('simple-base.lock'));
    expect(pkgs.fastapi?.version).toBe('0.110.0');
    expect(pkgs.pydantic?.version).toBe('2.6.4');
    expect(pkgs.starlette?.version).toBe('0.36.3');
    expect(pkgs.uvicorn?.version).toBe('0.29.0');
    expect(Object.keys(pkgs)).toHaveLength(4);
  });

  it('parses packages from head lockfile', () => {
    const pkgs = parseTomlPackages(fixture('simple-head.lock'));
    expect(pkgs.fastapi?.version).toBe('0.111.0');
    expect(pkgs['pydantic-settings']?.version).toBe('2.2.1');
    expect(Object.keys(pkgs)).toHaveLength(5);
  });

  it('produces correct diff', () => {
    const base = parseTomlPackages(fixture('simple-base.lock'));
    const head = parseTomlPackages(fixture('simple-head.lock'));
    const changes = diffPackages(
      base,
      head,
      directDeps(['fastapi', 'pydantic']),
      normalizePythonName,
    );
    const byName = Object.fromEntries(changes.map((c) => [c.name, c]));

    expect(byName.fastapi.change_type).toBe('updated');
    expect(byName.fastapi.is_direct).toBe(true);
    expect(byName.pydantic.change_type).toBe('updated');
    expect(byName.pydantic.is_direct).toBe(true);
    expect(byName.starlette.change_type).toBe('updated');
    expect(byName.starlette.is_direct).toBe(false);
    expect(byName['pydantic-settings'].change_type).toBe('added');
    expect(byName.uvicorn).toBeUndefined();
  });
});
