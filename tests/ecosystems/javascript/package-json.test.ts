import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  parseDirectDeps,
  normalizeJsName,
} from '../../../src/ecosystems/javascript/package-json.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/javascript/package-json', name), 'utf-8');

describe('parseDirectDeps (package.json)', () => {
  it('includes dependencies in prod', () => {
    const { prod } = parseDirectDeps(fixture('standard.json'));
    expect(prod.has('express')).toBe(true);
    expect(prod.has('lodash')).toBe(true);
  });

  it('includes devDependencies in dev, not prod', () => {
    const { prod, dev } = parseDirectDeps(fixture('standard.json'));
    expect(dev.has('typescript')).toBe(true);
    expect(dev.has('@types/node')).toBe(true);
    expect(prod.has('typescript')).toBe(false);
  });

  it('includes optionalDependencies in prod', () => {
    const { prod } = parseDirectDeps(fixture('standard.json'));
    expect(prod.has('fsevents')).toBe(true);
  });

  it('includes peerDependencies in prod', () => {
    const { prod } = parseDirectDeps(fixture('standard.json'));
    expect(prod.has('react')).toBe(true);
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
});

describe('normalizeJsName', () => {
  it('lowercases package names', () => {
    expect(normalizeJsName('Express')).toBe('express');
    expect(normalizeJsName('LODASH')).toBe('lodash');
  });

  it('preserves scoped package names', () => {
    expect(normalizeJsName('@babel/core')).toBe('@babel/core');
    expect(normalizeJsName('@Types/Node')).toBe('@types/node');
  });

  it('returns already-lowercase names unchanged', () => {
    expect(normalizeJsName('react')).toBe('react');
    expect(normalizeJsName('@scope/pkg')).toBe('@scope/pkg');
  });
});
