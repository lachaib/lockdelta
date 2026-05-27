import type { DirectDeps } from '../../types.js';

export function normalizeDenoName(name: string): string {
  return name.toLowerCase();
}

export function parseDirectDeps(content: string): DirectDeps {
  const prod = new Set<string>();

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return { prod, dev: new Set() };
  }

  const imports = data.imports as Record<string, string> | undefined;
  if (imports) {
    for (const specifier of Object.values(imports)) {
      const name = extractPackageName(specifier);
      if (name) prod.add(normalizeDenoName(name));
    }
  }

  const workspace = data.workspace as { dependencies?: string[] } | undefined;
  for (const specifier of workspace?.dependencies ?? []) {
    const name = extractPackageName(specifier);
    if (name) prod.add(normalizeDenoName(name));
  }

  return { prod, dev: new Set() };
}

function extractPackageName(specifier: string): string | null {
  // Handles "npm:chalk@^5.3.0", "jsr:@std/path@^0.224.0", "node:fs"
  const withoutProtocol = specifier.replace(/^(?:npm|jsr|node):/, '');

  // node: builtins have no version — skip
  if (specifier.startsWith('node:')) return null;

  if (withoutProtocol.startsWith('@')) {
    const atIdx = withoutProtocol.indexOf('@', 1);
    return atIdx > 0 ? withoutProtocol.slice(0, atIdx) : withoutProtocol;
  }
  const atIdx = withoutProtocol.indexOf('@');
  return atIdx > 0 ? withoutProtocol.slice(0, atIdx) : withoutProtocol || null;
}
