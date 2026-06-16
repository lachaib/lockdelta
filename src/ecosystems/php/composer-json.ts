import type { DirectDeps } from '../../types.js';

export function normalizeComposerName(name: string): string {
  return name.toLowerCase();
}

function isPlatformRequirement(name: string): boolean {
  return name === 'php' || name.startsWith('ext-') || name.startsWith('lib-') || name === 'hhvm';
}

export function parseDirectDeps(content: string): DirectDeps {
  const prod = new Set<string>();
  const dev = new Set<string>();

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return { prod, dev };
  }

  const require = data.require as Record<string, unknown> | undefined;
  if (require && typeof require === 'object') {
    for (const name of Object.keys(require)) {
      if (!isPlatformRequirement(name)) {
        prod.add(normalizeComposerName(name));
      }
    }
  }

  const requireDev = data['require-dev'] as Record<string, unknown> | undefined;
  if (requireDev && typeof requireDev === 'object') {
    for (const name of Object.keys(requireDev)) {
      if (!isPlatformRequirement(name)) {
        const normalized = normalizeComposerName(name);
        if (!prod.has(normalized)) dev.add(normalized);
      }
    }
  }

  return { prod, dev };
}
