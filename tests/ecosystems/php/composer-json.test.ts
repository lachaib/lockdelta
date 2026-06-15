import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  normalizeComposerName,
  parseDirectDeps,
} from '../../../src/ecosystems/php/composer-json.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/php/composer-json', name), 'utf-8');

describe('parseDirectDeps (composer.json)', () => {
  it('includes require entries in prod', () => {
    const { prod } = parseDirectDeps(fixture('standard.json'));
    expect(prod.has('symfony/console')).toBe(true);
    expect(prod.has('symfony/http-kernel')).toBe(true);
  });

  it('excludes platform requirements from prod', () => {
    const { prod } = parseDirectDeps(fixture('standard.json'));
    expect(prod.has('php')).toBe(false);
    expect(prod.has('ext-json')).toBe(false);
  });

  it('includes require-dev entries in dev, not prod', () => {
    const { prod, dev } = parseDirectDeps(fixture('standard.json'));
    expect(dev.has('phpunit/phpunit')).toBe(true);
    expect(prod.has('phpunit/phpunit')).toBe(false);
  });

  it('does not duplicate a package in dev if already in prod', () => {
    const content = JSON.stringify({
      require: { 'vendor/pkg': '^1.0' },
      'require-dev': { 'vendor/pkg': '^1.0' },
    });
    const { prod, dev } = parseDirectDeps(content);
    expect(prod.has('vendor/pkg')).toBe(true);
    expect(dev.has('vendor/pkg')).toBe(false);
  });

  it('returns empty DirectDeps for invalid JSON', () => {
    const { prod, dev } = parseDirectDeps('not json');
    expect(prod).toEqual(new Set());
    expect(dev).toEqual(new Set());
  });

  it('returns empty DirectDeps for empty string', () => {
    const { prod, dev } = parseDirectDeps('');
    expect(prod).toEqual(new Set());
    expect(dev).toEqual(new Set());
  });

  it('handles missing require and require-dev gracefully', () => {
    const { prod, dev } = parseDirectDeps('{}');
    expect(prod).toEqual(new Set());
    expect(dev).toEqual(new Set());
  });
});

describe('normalizeComposerName', () => {
  it('lowercases vendor and package name', () => {
    expect(normalizeComposerName('Symfony/Console')).toBe('symfony/console');
    expect(normalizeComposerName('PHPUnit/PHPUnit')).toBe('phpunit/phpunit');
  });

  it('returns already-lowercase names unchanged', () => {
    expect(normalizeComposerName('vendor/package')).toBe('vendor/package');
  });
});
