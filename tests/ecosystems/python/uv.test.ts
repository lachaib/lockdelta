import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parseTomlPackages } from '../../../src/ecosystems/python/parsers/toml.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/python/uv', name), 'utf-8');

describe('uv.lock parser', () => {
  it('parses all packages from a simple lockfile', () => {
    const pkgs = parseTomlPackages(fixture('simple-base.lock'));
    expect(pkgs).toEqual({
      certifi: '2024.2.2',
      'charset-normalizer': '3.3.2',
      idna: '3.6',
      requests: '2.31.0',
      urllib3: '2.2.1',
    });
  });

  it('parses all packages from head lockfile', () => {
    const pkgs = parseTomlPackages(fixture('simple-head.lock'));
    expect(pkgs).toMatchObject({
      requests: '2.32.3',
      httpx: '0.27.0',
      httpcore: '1.0.5',
      idna: '3.7',
    });
    expect(pkgs['urllib3']).toBe('2.2.1');
    expect(pkgs['certifi']).toBe('2024.2.2');
  });

  it('parses complex lockfile with many packages', () => {
    const pkgs = parseTomlPackages(fixture('complex-base.lock'));
    expect(Object.keys(pkgs)).toHaveLength(10);
    expect(pkgs['Django']).toBe('4.2.0');
    expect(pkgs['celery']).toBe('5.3.6');
    expect(pkgs['psycopg2']).toBe('2.9.9');
  });

  it('returns empty object for empty content', () => {
    expect(parseTomlPackages('')).toEqual({});
  });

  it('handles malformed TOML gracefully via regex fallback', () => {
    const malformed = `
[[package]]
name = "my-lib"
version = "1.2.3"

[[package]]
name = "other"
version = "0.1.0"
`;
    const pkgs = parseTomlPackages(malformed);
    expect(pkgs['my-lib']).toBe('1.2.3');
    expect(pkgs['other']).toBe('0.1.0');
  });
});
