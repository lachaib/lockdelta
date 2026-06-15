import type { PackageEntry } from '../../../types.js';

interface ComposerPackageDist {
  url?: unknown;
}

interface ComposerPackage {
  name?: unknown;
  version?: unknown;
  dist?: ComposerPackageDist;
}

interface ComposerLock {
  packages?: ComposerPackage[];
  'packages-dev'?: ComposerPackage[];
}

export function parseComposerLock(content: string): Record<string, PackageEntry> {
  let data: ComposerLock;
  try {
    data = JSON.parse(content) as ComposerLock;
  } catch {
    return {};
  }

  const result: Record<string, PackageEntry> = {};

  for (const [isDevGroup, list] of [
    [false, data.packages ?? []],
    [true, data['packages-dev'] ?? []],
  ] as [boolean, ComposerPackage[]][]) {
    for (const pkg of list) {
      if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') continue;

      const entry: PackageEntry = { version: pkg.version };
      if (isDevGroup) entry.dev = true;

      const distUrl = pkg.dist?.url;
      if (typeof distUrl === 'string') {
        try {
          entry.registryUrl = new URL(distUrl).origin;
        } catch {
          // skip malformed URL
        }
      }

      result[pkg.name] = entry;
    }
  }

  return result;
}
