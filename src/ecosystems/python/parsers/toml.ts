import { parse } from 'smol-toml';
import type { PackageEntry } from '../../../types.js';

interface TomlPackageSource {
  registry?: unknown;
  url?: unknown;
}

interface TomlPackage {
  name?: unknown;
  version?: unknown;
  source?: TomlPackageSource;
}

interface TomlData {
  package?: TomlPackage[];
  packages?: TomlPackage[]; // PEP 751 (pylock.toml) uses plural
}

export function parseTomlPackages(content: string): Record<string, PackageEntry> {
  try {
    const data = parse(content) as TomlData;
    const packages: Record<string, PackageEntry> = {};
    for (const pkg of [...(data.package ?? []), ...(data.packages ?? [])]) {
      if (typeof pkg.name === 'string' && typeof pkg.version === 'string') {
        const entry: PackageEntry = { version: pkg.version };
        // uv.lock: source = { registry = "..." }
        // poetry.lock: [package.source] with url = "..."
        const sourceUrl =
          typeof pkg.source?.registry === 'string'
            ? pkg.source.registry
            : typeof pkg.source?.url === 'string'
              ? pkg.source.url
              : undefined;
        if (sourceUrl !== undefined) {
          try {
            entry.registryUrl = new URL(sourceUrl).origin;
          } catch {
            // skip malformed URL
          }
        }
        packages[pkg.name] = entry;
      }
    }
    return packages;
  } catch {
    return parseTomlPackagesRegex(content);
  }
}

function parseTomlPackagesRegex(content: string): Record<string, PackageEntry> {
  const packages: Record<string, PackageEntry> = {};
  // matches both [[package]] (uv/poetry/pdm) and [[packages]] (pylock.toml / PEP 751)
  const blocks = content.split(/\[\[packages?\]\]/);
  for (const block of blocks) {
    const nameMatch = block.match(/\nname\s*=\s*"([^"]+)"/);
    const versionMatch = block.match(/\nversion\s*=\s*"([^"]+)"/);
    if (nameMatch && versionMatch) {
      const entry: PackageEntry = { version: versionMatch[1] };
      // uv.lock inline: source = { registry = "https://..." }
      const sourceRegistryMatch = block.match(/source\s*=\s*\{[^}]*registry\s*=\s*"([^"]+)"/);
      // poetry.lock sub-table: url = "https://..."
      const sourceUrlMatch = block.match(/\nurl\s*=\s*"([^"]+)"/);
      const sourceUrl = sourceRegistryMatch?.[1] ?? sourceUrlMatch?.[1];
      if (sourceUrl !== undefined) {
        try {
          entry.registryUrl = new URL(sourceUrl).origin;
        } catch {
          // skip malformed URL
        }
      }
      packages[nameMatch[1]] = entry;
    }
  }
  return packages;
}
