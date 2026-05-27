import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffPackages } from '../../../src/core/diff.js';
import { normalizeJsName } from '../../../src/ecosystems/javascript/package-json.js';
import { parseBunLock } from '../../../src/ecosystems/javascript/parsers/bun.js';
import { directDeps } from '../../helpers.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/javascript/bun', name), 'utf-8');

describe('bun.lock parser', () => {
  it('parses all npm packages from base lockfile', () => {
    const pkgs = parseBunLock(fixture('simple-base.lock'));
    expect(pkgs.express).toBe('4.18.2');
    expect(pkgs.lodash).toBe('4.17.21');
    expect(pkgs.typescript).toBe('5.4.5');
    expect(pkgs.accepts).toBe('1.3.8');
    expect(Object.keys(pkgs)).toHaveLength(4);
  });

  it('excludes workspace packages (version starts with workspace:)', () => {
    const pkgs = parseBunLock(fixture('monorepo.lock'));
    expect('@myorg/core' in pkgs).toBe(false);
    expect('@myorg/ui' in pkgs).toBe(false);
  });

  it('includes transitive npm packages from monorepo', () => {
    const pkgs = parseBunLock(fixture('monorepo.lock'));
    expect(pkgs.lodash).toBe('4.17.21');
    expect(pkgs.react).toBe('18.3.1');
  });

  it('produces correct diff between base and head', () => {
    const base = parseBunLock(fixture('simple-base.lock'));
    const head = parseBunLock(fixture('simple-head.lock'));
    const changes = diffPackages(
      base,
      head,
      directDeps(['express', 'lodash', 'axios', 'typescript']),
      normalizeJsName,
    );
    const byName = Object.fromEntries(changes.map((c) => [c.name, c]));

    expect(byName.express.change_type).toBe('updated');
    expect(byName.express.old_version).toBe('4.18.2');
    expect(byName.express.new_version).toBe('4.19.2');
    expect(byName.express.is_direct).toBe(true);

    expect(byName.axios.change_type).toBe('added');
    expect(byName.axios.is_direct).toBe(true);

    expect('lodash' in byName).toBe(false);
    expect('accepts' in byName).toBe(false);
  });

  it('returns empty object for empty packages section', () => {
    const content = JSON.stringify({ lockfileVersion: 0, workspaces: {}, packages: {} });
    expect(parseBunLock(content)).toEqual({});
  });

  it('is registered in the javascript ecosystem', async () => {
    const { javascriptEcosystem } = await import('../../../src/ecosystems/javascript/index.js');
    expect(javascriptEcosystem.getLockfileType('bun.lock')).toBe('bun');
  });
});
