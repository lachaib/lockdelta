import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parseNpmLock } from '../../../src/ecosystems/javascript/parsers/npm.js';
import { diffPackages } from '../../../src/core/diff.js';
import { normalizeJsName } from '../../../src/ecosystems/javascript/package-json.js';
import { directDeps } from '../../helpers.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/javascript/npm', name), 'utf-8');

describe('npm package-lock.json parser', () => {
  describe('lockfile v3', () => {
    it('parses all top-level packages from v3 format', () => {
      const pkgs = parseNpmLock(fixture('v3-simple-base.json'));
      expect(pkgs['express']).toBe('4.18.2');
      expect(pkgs['lodash']).toBe('4.17.21');
      expect(pkgs['typescript']).toBe('5.2.2');
      expect(pkgs['accepts']).toBe('1.3.8');
      expect(pkgs['ms']).toBe('2.1.3');
    });

    it('does not include the root package (empty key)', () => {
      const pkgs = parseNpmLock(fixture('v3-simple-base.json'));
      expect('myapp' in pkgs).toBe(false);
      expect('' in pkgs).toBe(false);
    });

    it('produces correct diff between base and head', () => {
      const base = parseNpmLock(fixture('v3-simple-base.json'));
      const head = parseNpmLock(fixture('v3-simple-head.json'));
      const changes = diffPackages(
        base,
        head,
        directDeps(['express', 'lodash', 'axios', 'typescript']),
        normalizeJsName,
      );
      const byName = Object.fromEntries(changes.map((c) => [c.name, c]));

      expect(byName['express'].change_type).toBe('updated');
      expect(byName['express'].old_version).toBe('4.18.2');
      expect(byName['express'].new_version).toBe('4.19.2');
      expect(byName['express'].is_direct).toBe(true);

      expect(byName['typescript'].change_type).toBe('updated');
      expect(byName['typescript'].old_version).toBe('5.2.2');
      expect(byName['typescript'].new_version).toBe('5.4.5');

      expect(byName['axios'].change_type).toBe('added');
      expect(byName['axios'].is_direct).toBe(true);

      expect('lodash' in byName).toBe(false);
      expect('ms' in byName).toBe(false);
    });
  });

  describe('lockfile v1', () => {
    it('parses flat dependencies from v1 format', () => {
      const pkgs = parseNpmLock(fixture('v1-simple-base.json'));
      expect(pkgs['express']).toBe('4.18.2');
      expect(pkgs['accepts']).toBe('1.3.8');
      expect(pkgs['lodash']).toBe('4.17.21');
      expect(pkgs['ms']).toBe('2.1.3');
    });
  });

  describe('scoped packages', () => {
    it('correctly handles @scope/package names', () => {
      const pkgs = parseNpmLock(fixture('scoped-packages.json'));
      expect(pkgs['@babel/core']).toBe('7.24.5');
      expect(pkgs['@babel/code-frame']).toBe('7.24.2');
      expect(pkgs['@types/node']).toBe('20.14.2');
    });

    it('skips nested node_modules entries for deduplication conflicts', () => {
      const pkgs = parseNpmLock(fixture('scoped-packages.json'));
      // semver@6.3.1 is nested under @babel/core, semver@7.6.2 is top-level
      // only the top-level version should appear
      expect(pkgs['semver']).toBe('7.6.2');
    });
  });
});
