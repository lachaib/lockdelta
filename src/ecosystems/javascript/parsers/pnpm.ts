import { parse as parseYaml } from 'yaml';
import type { PackageEntry } from '../../../types.js';

interface PnpmPackageResolution {
  integrity?: string;
  tarball?: string;
}

interface PnpmPackageInfo {
  resolution?: PnpmPackageResolution;
}

interface PnpmLock {
  lockfileVersion?: string | number;
  packages?: Record<string, unknown>;
}

export function parsePnpmLock(content: string): Record<string, PackageEntry> {
  const data = parseYaml(content) as PnpmLock;
  if (!data?.packages) return {};

  const lockfileVersion = parseLockfileVersion(data.lockfileVersion);

  if (lockfileVersion >= 9) {
    return parsePnpmV9(data.packages);
  }
  return parsePnpmLegacy(data.packages);
}

function parseLockfileVersion(v: string | number | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number.parseFloat(v);
  return 0;
}

function parsePnpmV9(packages: Record<string, unknown>): Record<string, PackageEntry> {
  const result: Record<string, PackageEntry> = {};

  for (const [key, value] of Object.entries(packages)) {
    let name: string;
    let version: string;

    if (key.startsWith('@')) {
      const atIdx = key.indexOf('@', 1);
      if (atIdx < 0) continue;
      name = key.slice(0, atIdx);
      version = key.slice(atIdx + 1);
    } else {
      const atIdx = key.indexOf('@');
      if (atIdx < 0) continue;
      name = key.slice(0, atIdx);
      version = key.slice(atIdx + 1);
    }

    version = stripVersionSuffix(version);
    if (name && version && !result[name]) {
      const entry: PackageEntry = { version };
      const pkg = value as PnpmPackageInfo | null;
      const registryUrl = pkg?.resolution?.tarball
        ? resolvedToOrigin(pkg.resolution.tarball)
        : undefined;
      if (registryUrl !== undefined) entry.registryUrl = registryUrl;
      result[name] = entry;
    }
  }

  return result;
}

function parsePnpmLegacy(packages: Record<string, unknown>): Record<string, PackageEntry> {
  const result: Record<string, PackageEntry> = {};

  for (const [key, value] of Object.entries(packages)) {
    const cleaned = key.startsWith('/') ? key.slice(1) : key;

    let name: string;
    let version: string;

    if (cleaned.startsWith('@')) {
      // Scoped package: @scope/name/version (v5) or @scope/name@version (v6)
      const secondSlash = cleaned.indexOf('/', cleaned.indexOf('/') + 1);
      const secondAt = cleaned.indexOf('@', 1);

      if (secondAt > 0 && (secondSlash < 0 || secondAt < secondSlash)) {
        // v6 style: @scope/name@version
        name = cleaned.slice(0, secondAt);
        version = cleaned.slice(secondAt + 1);
      } else if (secondSlash > 0) {
        // v5 style: @scope/name/version
        name = cleaned.slice(0, secondSlash);
        version = cleaned.slice(secondSlash + 1);
      } else {
        continue;
      }
    } else {
      const atIdx = cleaned.indexOf('@');
      const slashIdx = cleaned.indexOf('/');

      if (atIdx > 0 && (slashIdx < 0 || atIdx < slashIdx)) {
        // v6 style: name@version
        name = cleaned.slice(0, atIdx);
        version = cleaned.slice(atIdx + 1);
      } else if (slashIdx > 0) {
        // v5 style: name/version
        name = cleaned.slice(0, slashIdx);
        version = cleaned.slice(slashIdx + 1);
      } else {
        continue;
      }
    }

    version = stripVersionSuffix(version);
    if (name && version && !result[name]) {
      const entry: PackageEntry = { version };
      const pkg = value as PnpmPackageInfo | null;
      const registryUrl = pkg?.resolution?.tarball
        ? resolvedToOrigin(pkg.resolution.tarball)
        : undefined;
      if (registryUrl !== undefined) entry.registryUrl = registryUrl;
      result[name] = entry;
    }
  }

  return result;
}

// Remove peer dep hash suffixes: "1.2.3_abc123" or "1.2.3(peer@1.0)" → "1.2.3"
function stripVersionSuffix(version: string): string {
  return version.split('(')[0].split('_')[0].trim();
}

function resolvedToOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}
