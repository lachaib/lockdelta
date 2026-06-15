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
    const isDirectDev = directDeps.dev.has(normalized) && !isProd;
    // Some parsers (e.g. composer.lock) can tell us a package is dev even when it's transitive
    const isTransitiveDev =
      !isProd && !isDirectDev && (newPkgs[name]?.dev ?? oldPkgs[name]?.dev) === true;
    const isDev = isDirectDev || isTransitiveDev;

    const base = { name, is_direct: isProd || isDirectDev, is_dev: isDev };

    let change: PackageChange;
    if (!inOld) {
      change = {
        ...base,
        change_type: 'added',
        old_version: null,
        new_version: newPkgs[name].version,
      };
      if (newPkgs[name].registryUrl !== undefined)
        change.new_registry_url = newPkgs[name].registryUrl;
    } else if (!inNew) {
      change = {
        ...base,
        change_type: 'removed',
        old_version: oldPkgs[name].version,
        new_version: null,
      };
      if (oldPkgs[name].registryUrl !== undefined)
        change.old_registry_url = oldPkgs[name].registryUrl;
    } else {
      change = {
        ...base,
        change_type: 'updated',
        old_version: oldPkgs[name].version,
        new_version: newPkgs[name].version,
      };
      if (oldPkgs[name].registryUrl !== undefined)
        change.old_registry_url = oldPkgs[name].registryUrl;
      if (newPkgs[name].registryUrl !== undefined)
        change.new_registry_url = newPkgs[name].registryUrl;
    }

    changes.push(change);
  }

  return changes;
}
