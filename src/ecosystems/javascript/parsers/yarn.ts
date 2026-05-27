import { parse as parseYaml } from 'yaml';

export function parseYarnLock(content: string): Record<string, string> {
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

function parseYarnV1(content: string): Record<string, string> {
  const packages: Record<string, string> = {};
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
      packages[name] = versionMatch[1];
    }
  }

  return packages;
}

interface BerryEntry {
  version?: string;
  linkType?: string;
}

function parseYarnBerry(content: string): Record<string, string> {
  const data = parseYaml(content) as Record<string, BerryEntry | unknown>;
  const packages: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    if (key === '__metadata') continue;
    if (typeof value !== 'object' || !value) continue;

    const entry = value as BerryEntry;
    if (entry.linkType === 'soft') continue;
    if (!entry.version) continue;

    const cleanKey = key.replace(/^"|"$/g, '');
    const name = extractNameFromBerryKey(cleanKey);
    if (name && !packages[name]) {
      packages[name] = entry.version;
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
