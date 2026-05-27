import type { DirectDeps, PackageChange } from '../types.js';

export function diffPackages(
  oldPkgs: Record<string, string>,
  newPkgs: Record<string, string>,
  directDeps: DirectDeps,
  normalizeName: (name: string) => string,
): PackageChange[] {
  const allNames = new Set([...Object.keys(oldPkgs), ...Object.keys(newPkgs)]);
  const changes: PackageChange[] = [];

  for (const name of [...allNames].sort()) {
    const inOld = name in oldPkgs;
    const inNew = name in newPkgs;

    if (inOld && inNew && oldPkgs[name] === newPkgs[name]) continue;

    const normalized = normalizeName(name);
    const isProd = directDeps.prod.has(normalized);
    const isDev = directDeps.dev.has(normalized) && !isProd;

    changes.push({
      name,
      change_type: !inOld ? 'added' : !inNew ? 'removed' : 'updated',
      old_version: inOld ? oldPkgs[name] : null,
      new_version: inNew ? newPkgs[name] : null,
      is_direct: isProd || isDev,
      is_dev: isDev,
    });
  }

  return changes;
}
