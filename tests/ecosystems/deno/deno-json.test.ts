import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeDenoName, parseDirectDeps } from '../../../src/ecosystems/deno/deno-json.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/deno/deno-json', name), 'utf-8');

describe('parseDirectDeps (deno.json)', () => {
  it('extracts npm packages from imports field into prod', () => {
    const { prod } = parseDirectDeps(fixture('standard.json'));
    expect(prod.has('chalk')).toBe(true);
    expect(prod.has('zod')).toBe(true);
  });

  it('extracts jsr packages from imports field into prod', () => {
    const { prod } = parseDirectDeps(fixture('standard.json'));
    expect(prod.has('@std/path')).toBe(true);
  });

  it('skips node: builtins', () => {
    const { prod } = parseDirectDeps(fixture('standard.json'));
    expect(prod.has('fs')).toBe(false);
    expect(prod.has('node:fs')).toBe(false);
  });

  it('handles workspace.dependencies entries', () => {
    const content = JSON.stringify({
      workspace: {
        dependencies: ['npm:express@^4.18.2', 'jsr:@std/assert@^0.226.0'],
      },
    });
    const { prod } = parseDirectDeps(content);
    expect(prod.has('express')).toBe(true);
    expect(prod.has('@std/assert')).toBe(true);
  });

  it('returns empty DirectDeps for invalid JSON', () => {
    const { prod, dev } = parseDirectDeps('not json');
    expect(prod).toEqual(new Set());
    expect(dev).toEqual(new Set());
  });

  it('returns empty DirectDeps for empty object', () => {
    const { prod, dev } = parseDirectDeps('{}');
    expect(prod).toEqual(new Set());
    expect(dev).toEqual(new Set());
  });
});

describe('normalizeDenoName', () => {
  it('lowercases names', () => {
    expect(normalizeDenoName('Chalk')).toBe('chalk');
  });

  it('preserves scoped package names', () => {
    expect(normalizeDenoName('@std/path')).toBe('@std/path');
  });

  it('preserves jsr: prefixed names', () => {
    expect(normalizeDenoName('jsr:@std/path')).toBe('jsr:@std/path');
  });
});
