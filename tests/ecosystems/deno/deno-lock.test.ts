import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffPackages } from '../../../src/core/diff.js';
import { normalizeDenoName } from '../../../src/ecosystems/deno/deno-json.js';
import { parseDenoLock } from '../../../src/ecosystems/deno/parsers/deno-lock.js';
import { directDeps } from '../../helpers.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/deno', name), 'utf-8');

describe('deno.lock parser', () => {
  describe('v3 format', () => {
    it('parses npm packages', () => {
      const pkgs = parseDenoLock(fixture('v3-base.lock'));
      expect(pkgs.chalk?.version).toBe('5.3.0');
      expect(pkgs.zod?.version).toBe('3.22.4');
    });

    it('parses jsr packages with jsr: prefix', () => {
      const pkgs = parseDenoLock(fixture('v3-base.lock'));
      expect(pkgs['jsr:@std/path']?.version).toBe('0.224.0');
    });

    it('produces correct diff between base and head', () => {
      const base = parseDenoLock(fixture('v3-base.lock'));
      const head = parseDenoLock(fixture('v3-head.lock'));

      const changes = diffPackages(
        base,
        head,
        directDeps(['chalk', 'zod', 'hono']),
        normalizeDenoName,
      );
      const byName = Object.fromEntries(changes.map((c) => [c.name, c]));

      expect(byName.chalk.change_type).toBe('updated');
      expect(byName.chalk.old_version).toBe('5.3.0');
      expect(byName.chalk.new_version).toBe('5.4.1');
      expect(byName.chalk.is_direct).toBe(true);

      expect(byName.hono.change_type).toBe('added');
      expect(byName.hono.is_direct).toBe(true);

      expect(byName['jsr:@std/path'].change_type).toBe('updated');
      expect(byName['jsr:@std/path'].old_version).toBe('0.224.0');
      expect(byName['jsr:@std/path'].new_version).toBe('0.225.2');

      expect(byName['jsr:@std/assert'].change_type).toBe('added');

      expect('zod' in byName).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns empty object for remote-only lockfile (no npm/jsr packages)', () => {
      const pkgs = parseDenoLock(fixture('remote-only.lock'));
      expect(pkgs).toEqual({});
    });

    it('returns empty object for empty string', () => {
      expect(parseDenoLock('{}')).toEqual({});
    });
  });

  it('is registered as a separate ecosystem', async () => {
    const { getEcosystemByName, getEcosystemForLockfile } = await import(
      '../../../src/ecosystems/index.js'
    );
    expect(getEcosystemByName('deno')).toBeDefined();
    expect(getEcosystemForLockfile('deno.lock')?.name).toBe('deno');
  });
});
