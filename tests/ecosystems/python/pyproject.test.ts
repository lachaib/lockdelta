import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizePythonName, parseDirectDeps } from '../../../src/ecosystems/python/pyproject.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/python/pyproject', name), 'utf-8');

describe('parseDirectDeps', () => {
  describe('PEP 517/518 style (uv / pdm)', () => {
    it('extracts direct dependencies from [project].dependencies into prod', () => {
      const { prod } = parseDirectDeps(fixture('pep517.toml'));
      expect(prod.has('requests')).toBe(true);
      expect(prod.has('django')).toBe(true);
      expect(prod.has('celery')).toBe(true);
      expect(prod.has('redis')).toBe(true);
    });

    it('classifies optional-dependencies as dev, not prod', () => {
      const { prod, dev } = parseDirectDeps(fixture('pep517.toml'));
      expect(prod.has('pytest')).toBe(false);
      expect(prod.has('ruff')).toBe(false);
      expect(dev.has('pytest')).toBe(true);
      expect(dev.has('ruff')).toBe(true);
    });
  });

  describe('Poetry style', () => {
    it('extracts dependencies from [tool.poetry.dependencies] into prod', () => {
      const { prod } = parseDirectDeps(fixture('poetry-style.toml'));
      expect(prod.has('requests')).toBe(true);
      expect(prod.has('fastapi')).toBe(true);
      expect(prod.has('uvicorn')).toBe(true);
    });

    it('excludes python from poetry dependencies', () => {
      const { prod } = parseDirectDeps(fixture('poetry-style.toml'));
      expect(prod.has('python')).toBe(false);
    });

    it('classifies poetry group dependencies as dev deps', () => {
      const { prod, dev } = parseDirectDeps(fixture('poetry-style.toml'));
      expect(dev.has('pytest')).toBe(true);
      expect(dev.has('mypy')).toBe(true);
      expect(prod.has('pytest')).toBe(false);
    });
  });

  describe('name normalization', () => {
    it('normalizes hyphens to underscores', () => {
      expect(normalizePythonName('my-package')).toBe('my_package');
    });

    it('normalizes dots to underscores', () => {
      expect(normalizePythonName('my.package')).toBe('my_package');
    });

    it('normalizes mixed separators', () => {
      expect(normalizePythonName('My-Mixed.Package')).toBe('my_mixed_package');
    });

    it('collapses multiple separators', () => {
      expect(normalizePythonName('pkg--name')).toBe('pkg_name');
    });
  });

  it('returns empty DirectDeps for invalid TOML', () => {
    const { prod, dev } = parseDirectDeps('not valid toml [[[');
    expect(prod).toEqual(new Set());
    expect(dev).toEqual(new Set());
  });

  it('returns empty DirectDeps for empty string', () => {
    const { prod, dev } = parseDirectDeps('');
    expect(prod).toEqual(new Set());
    expect(dev).toEqual(new Set());
  });
});
