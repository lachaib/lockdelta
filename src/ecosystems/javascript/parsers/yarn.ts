import { parse as parseYaml } from 'yaml';
import type { PackageEntry } from '../../../types.js';

export function parseYarnLock(content: string): Record<string, PackageEntry> {
  return isYarnBerry(content) ? parseYarnBerry(content) : parseYarnV1(content);
}

function isYarnBerry(content: string): boolean {
  return content.includes('__metadata:');
}

function extractNameFromSpecifier(spec: string): string {
  const trimmed = spec.trim().replace(/^"|"$/g, '');
  if (trimmed.startsWith('@')) {
    const idx = trimmed.indexOf('@', 1);
    return idx > 0 ? trimmed.slice(0, idx) : trimmed;
  }
  const atIdx = trimmed.indexOf('@');
  return atIdx > 0 ? trimmed.slice(0, atIdx) : trimmed;
}

function parseYarnV1(content: string): Record<string, PackageEntry> {
  const packages: Record<string, PackageEntry> = {};
  const blocks = content.split(/\n\n+/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const versionMatch = trimmed.match(/^[ \t]+version "([^"]+)"/m);
    if (!versionMatch) continue;

    const headerLine = trimmed.split('\n')[0].trim().replace(/:$/, '');
    const firstSpecifier = headerLine.split(',')[0].trim().replace(/^"|"$/g, '');
    const name = extractNameFromSpecifier(firstSpecifier);

    if (name && !packages[name]) {
      const entry: PackageEntry = { version: versionMatch[1] };
      const resolvedMatch = trimmed.match(/^[ \t]+resolved "([^"]+)"/m);
      if (resolvedMatch) {
        const registryUrl = resolvedToOrigin(resolvedMatch[1]);
        if (registryUrl !== undefined) entry.registryUrl = registryUrl;
      }
      packages[name] = entry;
    }
  }

  return packages;
}

interface BerryEntry {
  version?: string;
  linkType?: string;
  resolution?: string;
}

function parseYarnBerry(content: string): Record<string, PackageEntry> {
  const data = parseYaml(content) as Record<string, BerryEntry | unknown>;
  const packages: Record<string, PackageEntry> = {};

  for (const [key, value] of Object.entries(data)) {
    if (key === '__metadata') continue;
    if (typeof value !== 'object' || !value) continue;

    const berryEntry = value as BerryEntry;
    if (berryEntry.linkType === 'soft') continue;
    if (!berryEntry.version) continue;

    const cleanKey = key.replace(/^"|"$/g, '');
    const name = extractNameFromBerryKey(cleanKey);
    if (name && !packages[name]) {
      const entry: PackageEntry = { version: berryEntry.version };
      const registryUrl = extractBerryRegistryOrigin(berryEntry.resolution);
      if (registryUrl !== undefined) entry.registryUrl = registryUrl;
      packages[name] = entry;
    }
  }

  return packages;
}

function extractNameFromBerryKey(key: string): string {
  // Format: "pkgname@protocol:specifier" e.g. "lodash@npm:^4.17.21"
  if (key.startsWith('@')) {
    const idx = key.indexOf('@', 1);
    return idx > 0 ? key.slice(0, idx) : key;
  }
  return key.split('@')[0];
}

function extractBerryRegistryOrigin(resolution: string | undefined): string | undefined {
  if (!resolution) return undefined;
  // "pkgname@npm:version" → npm public, no registryUrl
  // "pkgname@https://registry.example.com/..." → private tarball
  const atIdx = resolution.startsWith('@') ? resolution.indexOf('@', 1) : resolution.indexOf('@');
  if (atIdx < 0) return undefined;
  const spec = resolution.slice(atIdx + 1);
  if (spec.startsWith('http://') || spec.startsWith('https://')) {
    return resolvedToOrigin(spec.split('#')[0]);
  }
  return undefined;
}

function resolvedToOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}
