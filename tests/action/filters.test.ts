import { describe, expect, it } from 'vitest';
import { applyFilters, applyFiltersConfig } from '../../src/action/filters.js';
import type { PackageChange } from '../../src/types.js';

function makeChange(
  name: string,
  change_type: PackageChange['change_type'] = 'updated',
): PackageChange {
  return {
    name,
    change_type,
    old_version: '1.0.0',
    new_version: '2.0.0',
    is_direct: false,
    is_dev: false,
  };
}

describe('applyFilters', () => {
  it('returns true when a package in the group changed', () => {
    const changes = [makeChange('requests'), makeChange('httpx')];
    const result = applyFilters('auth:\n  - pyjwt\n  - requests', changes);
    expect(result.auth).toBe(true);
  });

  it('returns false when no package in the group changed', () => {
    const changes = [makeChange('lodash')];
    const result = applyFilters('auth:\n  - pyjwt\n  - requests', changes);
    expect(result.auth).toBe(false);
  });

  it('is case-insensitive', () => {
    const changes = [makeChange('Requests')];
    const result = applyFilters('auth:\n  - requests', changes);
    expect(result.auth).toBe(true);
  });

  it('handles multiple groups independently', () => {
    const changes = [makeChange('requests'), makeChange('express')];
    const yaml = 'http:\n  - requests\n  - httpx\njs:\n  - express\n  - lodash';
    const result = applyFilters(yaml, changes);
    expect(result.http).toBe(true);
    expect(result.js).toBe(true);
  });

  it('returns false for a group when only some packages changed', () => {
    const changes = [makeChange('requests')];
    const yaml = 'http:\n  - requests\n  - httpx\nsecurity:\n  - pyjwt\n  - cryptography';
    const result = applyFilters(yaml, changes);
    expect(result.http).toBe(true);
    expect(result.security).toBe(false);
  });

  it('returns empty object for empty filters string', () => {
    expect(applyFilters('', [makeChange('requests')])).toEqual({});
  });

  it('returns empty object for whitespace-only filters', () => {
    expect(applyFilters('   \n  ', [makeChange('requests')])).toEqual({});
  });

  it('works with added and removed changes', () => {
    const changes = [makeChange('httpx', 'added'), makeChange('urllib3', 'removed')];
    const result = applyFilters('http:\n  - httpx\n  - requests', changes);
    expect(result.http).toBe(true);
  });

  it('returns false for all groups when there are no changes', () => {
    const result = applyFilters('auth:\n  - pyjwt', []);
    expect(result.auth).toBe(false);
  });
});

describe('applyFiltersConfig', () => {
  it('inline config wins over file config on key collision', () => {
    const changes = [makeChange('cryptography')];
    const fileConfig = { auth: ['pyjwt'] };
    const inlineConfig = { auth: ['cryptography'] };
    const merged = { ...fileConfig, ...inlineConfig };
    const result = applyFiltersConfig(merged, changes);
    // inline definition wins: cryptography matches, pyjwt does not
    expect(result.auth).toBe(true);
  });

  it('merges non-colliding groups from both sources', () => {
    const changes = [makeChange('pyjwt'), makeChange('express')];
    const fileConfig = { auth: ['pyjwt'] };
    const inlineConfig = { frontend: ['express'] };
    const merged = { ...fileConfig, ...inlineConfig };
    const result = applyFiltersConfig(merged, changes);
    expect(result.auth).toBe(true);
    expect(result.frontend).toBe(true);
  });
});
