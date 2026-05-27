import { parse } from 'yaml';
import type { PackageChange } from '../types.js';

export function applyFilters(
  filtersYaml: string,
  changes: PackageChange[],
): Record<string, boolean> {
  if (!filtersYaml.trim()) return {};

  let config: Record<string, unknown>;
  try {
    config = parse(filtersYaml) as Record<string, unknown>;
  } catch {
    return {};
  }

  if (!config || typeof config !== 'object') return {};

  const changedNames = new Set(changes.map((c) => c.name.toLowerCase()));
  const result: Record<string, boolean> = {};

  for (const [groupName, packages] of Object.entries(config)) {
    if (!Array.isArray(packages)) continue;
    result[groupName] = packages.some(
      (pkg) => typeof pkg === 'string' && changedNames.has(pkg.toLowerCase()),
    );
  }

  return result;
}
