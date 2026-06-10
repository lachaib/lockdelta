import type { PackageEntry } from '../../../types.js';

interface DenoLock {
  version?: string;
  packages?: {
    npm?: Record<string, unknown>;
    jsr?: Record<string, unknown>;
  };
}

export function parseDenoLock(content: string): Record<string, PackageEntry> {
  const data = JSON.parse(content) as DenoLock;
  const result: Record<string, PackageEntry> = {};

  for (const [key, registry] of [
    ['npm', data.packages?.npm],
    ['jsr', data.packages?.jsr],
  ] as const) {
    if (!registry) continue;
    for (const specifier of Object.keys(registry)) {
      const { name, version } = splitSpecifier(specifier);
      // Prefix JSR packages to avoid collisions with same-named npm packages
      const resultKey = key === 'jsr' ? `jsr:${name}` : name;
      if (name && version && !result[resultKey]) {
        result[resultKey] = { version };
      }
    }
  }

  return result;
}

function splitSpecifier(specifier: string): { name: string; version: string } {
  if (specifier.startsWith('@')) {
    const atIdx = specifier.indexOf('@', 1);
    if (atIdx < 0) return { name: specifier, version: '' };
    return { name: specifier.slice(0, atIdx), version: specifier.slice(atIdx + 1) };
  }
  const atIdx = specifier.indexOf('@');
  if (atIdx < 0) return { name: specifier, version: '' };
  return { name: specifier.slice(0, atIdx), version: specifier.slice(atIdx + 1) };
}
