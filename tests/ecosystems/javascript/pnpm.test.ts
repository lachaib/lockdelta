import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parsePnpmLock } from '../../../src/ecosystems/javascript/parsers/pnpm.js';
import { diffPackages } from '../../../src/core/diff.js';
import { normalizeJsName } from '../../../src/ecosystems/javascript/package-json.js';
import { directDeps } from '../../helpers.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/javascript/pnpm', name), 'utf-8');

describe('pnpm-lock.yaml parser', () => {
  describe('lockfile v9', () => {
    it('parses packages from v9 format', () => {
      const pkgs = parsePnpmLock(fixture('v9-base.yaml'));
      expect(pkgs['express']).toBe('4.18.2');
      expect(pkgs['lodash']).toBe('4.17.21');
      expect(pkgs['typescript']).toBe('5.2.2');
      expect(pkgs['accepts']).toBe('1.3.8');
    });

    it('does not include snapshots — only packages section', () => {
      // snapshots may have peer dep variants; packages section is canonical
      const pkgs = parsePnpmLock(fixture('v9-base.yaml'));
      expect(Object.keys(pkgs)).toHaveLength(4);
    });

    it('produces correct diff between v9 base and head', () => {
      const base = parsePnpmLock(fixture('v9-base.yaml'));
      const head = parsePnpmLock(fixture('v9-head.yaml'));
      const changes = diffPackages(
        base,
        head,
        directDeps(['express', 'lodash', 'typescript', 'axios']),
        normalizeJsName,
      );
      const byName = Object.fromEntries(changes.map((c) => [c.name, c]));

      expect(byName['express'].change_type).toBe('updated');
      expect(byName['express'].old_version).toBe('4.18.2');
      expect(byName['express'].new_version).toBe('4.19.2');
      expect(byName['express'].is_direct).toBe(true);

      expect(byName['axios'].change_type).toBe('added');
      expect(byName['typescript'].change_type).toBe('updated');

      expect('lodash' in byName).toBe(false);
      expect('accepts' in byName).toBe(false);
    });
  });

  describe('lockfile v6', () => {
    it('parses packages from v6 format (/@name@version keys)', () => {
      const pkgs = parsePnpmLock(fixture('v6-base.yaml'));
      expect(pkgs['express']).toBe('4.18.2');
      expect(pkgs['lodash']).toBe('4.17.21');
      expect(pkgs['typescript']).toBe('5.2.2');
    });

    it('handles scoped packages in v6 format', () => {
      const pkgs = parsePnpmLock(fixture('v6-base.yaml'));
      expect(pkgs['@babel/core']).toBe('7.24.0');
    });
  });

  describe('edge cases', () => {
    it('returns empty object for empty content', () => {
      expect(parsePnpmLock('')).toEqual({});
    });

    it('returns empty object when no packages section', () => {
      expect(parsePnpmLock("lockfileVersion: '9.0'\n")).toEqual({});
    });
  });
});
