import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffPackages } from '../../../src/core/diff.js';
import { normalizeComposerName } from '../../../src/ecosystems/php/composer-json.js';
import { parseComposerLock } from '../../../src/ecosystems/php/parsers/composer.js';
import { directDeps } from '../../helpers.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/php/composer-lock', name), 'utf-8');

describe('composer.lock parser', () => {
  it('parses production packages', () => {
    const pkgs = parseComposerLock(fixture('simple-base.json'));
    expect(pkgs['symfony/console']?.version).toBe('v6.4.0');
    expect(pkgs['symfony/http-kernel']?.version).toBe('v6.4.0');
  });

  it('parses dev packages', () => {
    const pkgs = parseComposerLock(fixture('simple-base.json'));
    expect(pkgs['phpunit/phpunit']?.version).toBe('10.5.0');
    expect(pkgs['phpunit/php-code-coverage']?.version).toBe('10.1.3');
  });

  it('extracts registry URL from dist.url', () => {
    const pkgs = parseComposerLock(fixture('simple-base.json'));
    expect(pkgs['symfony/console']?.registryUrl).toBe('https://api.github.com');
  });

  it('sets registryUrl for packages from a private Satis registry', () => {
    const pkgs = parseComposerLock(fixture('private-registry.json'));
    expect(pkgs['acme/framework']?.registryUrl).toBe('https://satis.acme.example.com');
  });

  it('uses public GitHub CDN for Packagist-backed packages', () => {
    const pkgs = parseComposerLock(fixture('private-registry.json'));
    expect(pkgs['symfony/console']?.registryUrl).toBe('https://api.github.com');
  });

  it('omits registryUrl when dist is absent', () => {
    const content = JSON.stringify({
      packages: [{ name: 'vendor/no-dist', version: '1.0.0' }],
      'packages-dev': [],
    });
    const pkgs = parseComposerLock(content);
    expect(pkgs['vendor/no-dist']?.registryUrl).toBeUndefined();
  });

  it('returns empty object for invalid JSON', () => {
    expect(parseComposerLock('not json')).toEqual({});
  });

  it('returns empty object for empty string', () => {
    expect(parseComposerLock('')).toEqual({});
  });

  it('marks packages-dev entries with dev flag', () => {
    const pkgs = parseComposerLock(fixture('simple-base.json'));
    expect(pkgs['phpunit/phpunit']?.dev).toBe(true);
    expect(pkgs['phpunit/php-code-coverage']?.dev).toBe(true);
    expect(pkgs['symfony/console']?.dev).toBeUndefined();
    expect(pkgs['symfony/http-kernel']?.dev).toBeUndefined();
  });

  it('marks transitive dev deps as is_dev even when not in require-dev', () => {
    const base = parseComposerLock(fixture('simple-base.json'));
    // head bumps phpunit/php-code-coverage (transitive dep of phpunit, lives in packages-dev)
    const head = parseComposerLock(
      JSON.stringify({
        packages: [],
        'packages-dev': [
          { name: 'phpunit/phpunit', version: '10.5.0' },
          { name: 'phpunit/php-code-coverage', version: '10.1.4' },
        ],
      }),
    );
    // phpunit/php-code-coverage is NOT listed as a direct dep in either set
    const changes = diffPackages(
      base,
      head,
      directDeps(['symfony/console'], ['phpunit/phpunit']),
      normalizeComposerName,
    );
    const byName = Object.fromEntries(changes.map((c) => [c.name, c]));

    expect(byName['phpunit/php-code-coverage'].is_dev).toBe(true);
    expect(byName['phpunit/php-code-coverage'].is_direct).toBe(false);
  });

  it('produces correct diff between base and head', () => {
    const base = parseComposerLock(fixture('simple-base.json'));
    const head = parseComposerLock(fixture('simple-head.json'));
    const changes = diffPackages(
      base,
      head,
      directDeps(
        ['symfony/console', 'symfony/http-kernel', 'guzzlehttp/guzzle'],
        ['phpunit/phpunit'],
      ),
      normalizeComposerName,
    );
    const byName = Object.fromEntries(changes.map((c) => [c.name, c]));

    expect(byName['symfony/console'].change_type).toBe('updated');
    expect(byName['symfony/console'].old_version).toBe('v6.4.0');
    expect(byName['symfony/console'].new_version).toBe('v6.4.2');
    expect(byName['symfony/console'].is_direct).toBe(true);
    expect(byName['symfony/console'].is_dev).toBe(false);

    expect(byName['guzzlehttp/guzzle'].change_type).toBe('added');
    expect(byName['guzzlehttp/guzzle'].is_direct).toBe(true);
    expect(byName['guzzlehttp/guzzle'].is_dev).toBe(false);

    expect(byName['phpunit/phpunit'].change_type).toBe('updated');
    expect(byName['phpunit/phpunit'].old_version).toBe('10.5.0');
    expect(byName['phpunit/phpunit'].new_version).toBe('10.5.3');
    expect(byName['phpunit/phpunit'].is_direct).toBe(true);
    expect(byName['phpunit/phpunit'].is_dev).toBe(true);

    expect('symfony/http-kernel' in byName).toBe(false);
    expect('phpunit/php-code-coverage' in byName).toBe(false);
  });
});
