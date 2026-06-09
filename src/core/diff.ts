import type { DirectDeps, PackageChange, PackageEntry } from '../types.js';

export function diffPackages(
  oldPkgs: Record<string, PackageEntry>,
  newPkgs: Record<string, PackageEntry>,
  directDeps: DirectDeps,
  normalizeName: (name: string) => string,
): PackageChange[] {
  const allNames = new Set([...Object.keys(oldPkgs), ...Object.keys(newPkgs)]);
  const changes: PackageChange[] = [];

  for (const name of [...allNames].sort()) {
    const inOld = name in oldPkgs;
    const inNew = name in newPkgs;

    if (inOld && inNew && oldPkgs[name].version === newPkgs[name].version) continue;

    const normalized = normalizeName(name);
    const isProd = directDeps.prod.has(normalized);
    const isDev = directDeps.dev.has(normalized) && !isProd;

    const change: PackageChange = {
      name,
      change_type: !inOld ? 'added' : !inNew ? 'removed' : 'updated',
      old_version: inOld ? oldPkgs[name].version : null,
      new_version: inNew ? newPkgs[name].version : null,
      is_direct: isProd || isDev,
      is_dev: isDev,
    };

    const oldRegistryUrl = inOld ? oldPkgs[name].registryUrl : undefined;
    const newRegistryUrl = inNew ? newPkgs[name].registryUrl : undefined;
    if (oldRegistryUrl !== undefined) change.old_registry_url = oldRegistryUrl;
    if (newRegistryUrl !== undefined) change.new_registry_url = newRegistryUrl;

    changes.push(change);
  }

  return changes;
}
