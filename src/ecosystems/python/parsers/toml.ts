import { parse } from 'smol-toml';

interface TomlPackage {
  name?: unknown;
  version?: unknown;
}

interface TomlData {
  package?: TomlPackage[];
  packages?: TomlPackage[]; // PEP 751 (pylock.toml) uses plural
}

export function parseTomlPackages(content: string): Record<string, string> {
  try {
    const data = parse(content) as TomlData;
    const packages: Record<string, string> = {};
    for (const pkg of [...(data.package ?? []), ...(data.packages ?? [])]) {
      if (typeof pkg.name === 'string' && typeof pkg.version === 'string') {
        packages[pkg.name] = pkg.version;
      }
    }
    return packages;
  } catch {
    return parseTomlPackagesRegex(content);
  }
}

function parseTomlPackagesRegex(content: string): Record<string, string> {
  const packages: Record<string, string> = {};
  // matches both [[package]] (uv/poetry/pdm) and [[packages]] (pylock.toml / PEP 751)
  const blocks = content.split(/\[\[packages?\]\]/);
  for (const block of blocks) {
    const nameMatch = block.match(/\nname\s*=\s*"([^"]+)"/);
    const versionMatch = block.match(/\nversion\s*=\s*"([^"]+)"/);
    if (nameMatch && versionMatch) {
      packages[nameMatch[1]] = versionMatch[1];
    }
  }
  return packages;
}
