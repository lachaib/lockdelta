import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTomlPackages } from '../../../src/ecosystems/python/parsers/toml.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../fixtures/python/uv', name), 'utf-8');

describe('uv.lock parser', () => {
  it('parses all packages from a simple lockfile', () => {
    const pkgs = parseTomlPackages(fixture('simple-base.lock'));
    expect(pkgs.certifi?.version).toBe('2024.2.2');
    expect(pkgs['charset-normalizer']?.version).toBe('3.3.2');
    expect(pkgs.idna?.version).toBe('3.6');
    expect(pkgs.requests?.version).toBe('2.31.0');
    expect(pkgs.urllib3?.version).toBe('2.2.1');
    expect(Object.keys(pkgs)).toHaveLength(5);
  });

  it('extracts registryUrl from source.registry field', () => {
    const pkgs = parseTomlPackages(fixture('simple-base.lock'));
    expect(pkgs.requests?.registryUrl).toBe('https://pypi.org');
  });

  it('parses all packages from head lockfile', () => {
    const pkgs = parseTomlPackages(fixture('simple-head.lock'));
    expect(pkgs.requests?.version).toBe('2.32.3');
    expect(pkgs.httpx?.version).toBe('0.27.0');
    expect(pkgs.httpcore?.version).toBe('1.0.5');
    expect(pkgs.idna?.version).toBe('3.7');
    expect(pkgs.urllib3?.version).toBe('2.2.1');
    expect(pkgs.certifi?.version).toBe('2024.2.2');
  });

  it('parses complex lockfile with many packages', () => {
    const pkgs = parseTomlPackages(fixture('complex-base.lock'));
    expect(Object.keys(pkgs)).toHaveLength(10);
    expect(pkgs.Django?.version).toBe('4.2.0');
    expect(pkgs.celery?.version).toBe('5.3.6');
    expect(pkgs.psycopg2?.version).toBe('2.9.9');
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
    expect(pkgs['my-lib']?.version).toBe('1.2.3');
    expect(pkgs.other?.version).toBe('0.1.0');
  });

  it('extracts registryUrl from private uv.lock source via regex fallback', () => {
    const _content = `
[[package]]
name = "private-pkg"
version = "1.0.0"
source = { registry = "https://private.example.com/simple" }
`;
    // Force regex fallback by using content that smol-toml might parse differently
    // Test against regex path directly via malformed TOML header
    const malformed = `invalid toml header !!!
[[package]]
name = "private-pkg"
version = "1.0.0"
source = { registry = "https://private.example.com/simple" }
`;
    const pkgs = parseTomlPackages(malformed);
    expect(pkgs['private-pkg']?.registryUrl).toBe('https://private.example.com');
  });

  it('sets registryUrl for private source via TOML parser', () => {
    const content = `
[[package]]
name = "private-pkg"
version = "1.0.0"
source = { registry = "https://private.example.com/simple" }
`;
    const pkgs = parseTomlPackages(content);
    expect(pkgs['private-pkg']?.registryUrl).toBe('https://private.example.com');
  });
});
