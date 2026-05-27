interface NpmPackageV1 {
  version?: string;
  dependencies?: Record<string, NpmPackageV1>;
}

interface NpmPackageLockV1 {
  lockfileVersion?: number;
  dependencies?: Record<string, NpmPackageV1>;
}

interface NpmPackageLockV2 {
  lockfileVersion?: number;
  packages?: Record<string, { version?: string }>;
}

export function parseNpmLock(content: string): Record<string, string> {
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

function parseV2Packages(packages: Record<string, { version?: string }>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, pkg] of Object.entries(packages)) {
    if (!key) continue;
    if (!key.startsWith('node_modules/')) continue;

    const segments = key.split('node_modules/');
    if (segments.length > 2) continue;

    const name = key.slice('node_modules/'.length);
    const pkgVersion = pkg.version;
    if (pkgVersion && !result[name]) {
      result[name] = pkgVersion;
    }
  }

  return result;
}

function parseV1Dependencies(
  deps: Record<string, NpmPackageV1>,
  result: Record<string, string> = {},
): Record<string, string> {
  for (const [name, pkg] of Object.entries(deps)) {
    if (pkg.version && !result[name]) {
      result[name] = pkg.version;
    }
    if (pkg.dependencies) {
      parseV1Dependencies(pkg.dependencies, result);
    }
  }
  return result;
}
