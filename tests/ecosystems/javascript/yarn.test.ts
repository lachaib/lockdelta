import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffPackages } from '../../../src/core/diff.js';
import { normalizeJsName } from '../../../src/ecosystems/javascript/package-json.js';
import { parseYarnLock } from '../../../src/ecosystems/javascript/parsers/yarn.js';
import { directDeps } from '../../helpers.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/javascript/yarn', name), 'utf-8');

describe('yarn.lock parser', () => {
  describe('yarn classic (v1)', () => {
    it('parses packages from v1 format', () => {
      const pkgs = parseYarnLock(fixture('v1-base.lock'));
      expect(pkgs.express).toBe('4.18.2');
      expect(pkgs.lodash).toBe('4.17.21');
      expect(pkgs.typescript).toBe('5.2.2');
    });

    it('handles scoped packages with multiple specifiers', () => {
      const pkgs = parseYarnLock(fixture('v1-base.lock'));
      expect(pkgs['@babel/core']).toBe('7.23.9');
    });

    it('produces correct diff between v1 base and head', () => {
      const base = parseYarnLock(fixture('v1-base.lock'));
      const head = parseYarnLock(fixture('v1-head.lock'));
      const changes = diffPackages(
        base,
        head,
        directDeps(['express', 'lodash', '@babel/core', 'typescript']),
        normalizeJsName,
      );
      const byName = Object.fromEntries(changes.map((c) => [c.name, c]));

      expect(byName.express.change_type).toBe('updated');
      expect(byName.express.old_version).toBe('4.18.2');
      expect(byName.express.new_version).toBe('4.19.2');

      expect(byName['@babel/core'].change_type).toBe('updated');
      expect(byName['@babel/core'].old_version).toBe('7.23.9');
      expect(byName['@babel/core'].new_version).toBe('7.24.5');

      expect(byName.axios.change_type).toBe('added');
      expect(byName.axios.is_direct).toBe(false);

      expect(byName.typescript.change_type).toBe('updated');

      expect('lodash' in byName).toBe(false);
    });
  });

  describe('yarn berry (v2+)', () => {
    it('parses packages from Berry format', () => {
      const pkgs = parseYarnLock(fixture('berry-base.lock'));
      expect(pkgs.express).toBe('4.18.2');
      expect(pkgs.lodash).toBe('4.17.21');
      expect(pkgs['@babel/core']).toBe('7.24.0');
      expect(pkgs.typescript).toBe('5.4.5');
    });

    it('excludes workspace packages (linkType: soft)', () => {
      const pkgs = parseYarnLock(fixture('berry-base.lock'));
      expect('myapp' in pkgs).toBe(false);
    });

    it('excludes __metadata entry', () => {
      const pkgs = parseYarnLock(fixture('berry-base.lock'));
      expect('__metadata' in pkgs).toBe(false);
    });

    it('produces correct diff between Berry base and head', () => {
      const base = parseYarnLock(fixture('berry-base.lock'));
      const head = parseYarnLock(fixture('berry-head.lock'));

      const changes = diffPackages(base, head, directDeps(['express', 'lodash']), normalizeJsName);
      const byName = Object.fromEntries(changes.map((c) => [c.name, c]));

      expect(byName.express.change_type).toBe('updated');
      expect(byName.express.new_version).toBe('4.19.2');
      expect(byName.express.is_direct).toBe(true);

      expect(byName['@babel/core'].change_type).toBe('updated');
      expect(byName['@babel/core'].is_direct).toBe(false);

      expect(byName.axios.change_type).toBe('added');
      expect('lodash' in byName).toBe(false);
    });
  });

  describe('format auto-detection', () => {
    it('correctly identifies v1 format (no __metadata)', () => {
      const content = fixture('v1-base.lock');
      expect(content).not.toContain('__metadata');
      const pkgs = parseYarnLock(content);
      expect(pkgs.express).toBe('4.18.2');
    });

    it('correctly identifies Berry format (has __metadata)', () => {
      const content = fixture('berry-base.lock');
      expect(content).toContain('__metadata:');
      const pkgs = parseYarnLock(content);
      expect(pkgs.express).toBe('4.18.2');
    });
  });
});
