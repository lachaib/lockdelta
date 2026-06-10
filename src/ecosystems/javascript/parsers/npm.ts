import type { PackageEntry } from '../../../types.js';

interface NpmPackageV1 {
  version?: string;
  resolved?: string;
  dependencies?: Record<string, NpmPackageV1>;
}

interface NpmPackageLockV1 {
  lockfileVersion?: number;
  dependencies?: Record<string, NpmPackageV1>;
}

interface NpmPackageV2 {
  version?: string;
  resolved?: string;
}

interface NpmPackageLockV2 {
  lockfileVersion?: number;
  packages?: Record<string, NpmPackageV2>;
}

export function parseNpmLock(content: string): Record<string, PackageEntry> {
  const data = JSON.parse(content) as NpmPackageLockV1 & NpmPackageLockV2;
  const version = data.lockfileVersion ?? 1;

  if (version >= 2 && data.packages) {
    return parseV2Packages(data.packages);
  }

  if (data.dependencies) {
    return parseV1Dependencies(data.dependencies);
  }

  return {};
}

function parseV2Packages(packages: Record<string, NpmPackageV2>): Record<string, PackageEntry> {
  const result: Record<string, PackageEntry> = {};

  for (const [key, pkg] of Object.entries(packages)) {
    if (!key) continue;
    if (!key.startsWith('node_modules/')) continue;

    const segments = key.split('node_modules/');
    if (segments.length > 2) continue;

    const name = key.slice('node_modules/'.length);
    const pkgVersion = pkg.version;
    if (pkgVersion && !result[name]) {
      const entry: PackageEntry = { version: pkgVersion };
      const registryUrl = resolvedToOrigin(pkg.resolved);
      if (registryUrl !== undefined) entry.registryUrl = registryUrl;
      result[name] = entry;
    }
  }

  return result;
}

function parseV1Dependencies(
  deps: Record<string, NpmPackageV1>,
  result: Record<string, PackageEntry> = {},
): Record<string, PackageEntry> {
  for (const [name, pkg] of Object.entries(deps)) {
    if (pkg.version && !result[name]) {
      const entry: PackageEntry = { version: pkg.version };
      const registryUrl = resolvedToOrigin(pkg.resolved);
      if (registryUrl !== undefined) entry.registryUrl = registryUrl;
      result[name] = entry;
    }
    if (pkg.dependencies) {
      parseV1Dependencies(pkg.dependencies, result);
    }
  }
  return result;
}

function resolvedToOrigin(resolved: string | undefined): string | undefined {
  if (!resolved) return undefined;
  try {
    return new URL(resolved).origin;
  } catch {
    return undefined;
  }
}
