import type { DirectDeps } from '../../types.js';

const PROD_SECTIONS = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const;

export function normalizeJsName(name: string): string {
  return name.toLowerCase();
}

export function parseDirectDeps(content: string): DirectDeps {
  const prod = new Set<string>();
  const dev = new Set<string>();

  let data: Record<string, Record<string, string>>;
  try {
    data = JSON.parse(content) as Record<string, Record<string, string>>;
  } catch {
    return { prod, dev };
  }

  for (const section of PROD_SECTIONS) {
    const deps = data[section];
    if (deps && typeof deps === 'object') {
      for (const name of Object.keys(deps)) {
        prod.add(normalizeJsName(name));
      }
    }
  }

  const devDeps = data.devDependencies;
  if (devDeps && typeof devDeps === 'object') {
    for (const name of Object.keys(devDeps)) {
      const normalized = normalizeJsName(name);
      if (!prod.has(normalized)) dev.add(normalized);
    }
  }

  return { prod, dev };
}
