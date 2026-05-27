import { parse } from 'smol-toml';
import type { DirectDeps } from '../../types.js';

export function normalizePythonName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '_');
}

function extractPkgName(dep: string): string | null {
  const match = String(dep).match(/^([\w][\w.-]*)/);
  return match ? normalizePythonName(match[1]) : null;
}

export function parseDirectDeps(content: string): DirectDeps {
  const prod = new Set<string>();
  const dev = new Set<string>();

  let data: Record<string, unknown>;
  try {
    data = parse(content) as Record<string, unknown>;
  } catch {
    return { prod, dev };
  }

  // PEP 517/518: [project].dependencies → prod
  const project = data['project'] as Record<string, unknown> | undefined;
  const pep517Deps = project?.['dependencies'] as string[] | undefined;
  if (Array.isArray(pep517Deps)) {
    for (const dep of pep517Deps) {
      const name = extractPkgName(dep);
      if (name) prod.add(name);
    }
  }

  // PEP 517/518: [project.optional-dependencies].* → dev
  const optDeps = project?.['optional-dependencies'] as Record<string, string[]> | undefined;
  if (optDeps && typeof optDeps === 'object') {
    for (const group of Object.values(optDeps)) {
      if (Array.isArray(group)) {
        for (const dep of group) {
          const name = extractPkgName(dep);
          if (name && !prod.has(name)) dev.add(name);
        }
      }
    }
  }

  const tool = data['tool'] as Record<string, unknown> | undefined;
  const poetry = tool?.['poetry'] as Record<string, unknown> | undefined;
  if (poetry) {
    // [tool.poetry.dependencies] → prod
    const poetryDeps = poetry['dependencies'] as Record<string, unknown> | undefined;
    if (poetryDeps) {
      for (const key of Object.keys(poetryDeps)) {
        if (key.toLowerCase() !== 'python') prod.add(normalizePythonName(key));
      }
    }

    // [tool.poetry.dev-dependencies] → dev
    const devDeps = poetry['dev-dependencies'] as Record<string, unknown> | undefined;
    if (devDeps) {
      for (const key of Object.keys(devDeps)) {
        const normalized = normalizePythonName(key);
        if (!prod.has(normalized)) dev.add(normalized);
      }
    }

    // [tool.poetry.group.*].dependencies → dev
    const groups = poetry['group'] as Record<string, Record<string, unknown>> | undefined;
    if (groups) {
      for (const group of Object.values(groups)) {
        const groupDeps = group['dependencies'] as Record<string, unknown> | undefined;
        if (groupDeps) {
          for (const key of Object.keys(groupDeps)) {
            const normalized = normalizePythonName(key);
            if (!prod.has(normalized)) dev.add(normalized);
          }
        }
      }
    }
  }

  // [tool.uv.dev-dependencies] → dev
  const uv = tool?.['uv'] as Record<string, unknown> | undefined;
  const uvDevDeps = uv?.['dev-dependencies'] as string[] | undefined;
  if (Array.isArray(uvDevDeps)) {
    for (const dep of uvDevDeps) {
      const name = extractPkgName(dep);
      if (name && !prod.has(name)) dev.add(name);
    }
  }

  // [dependency-groups].* → dev (PEP 735)
  const depGroups = data['dependency-groups'] as Record<string, unknown[]> | undefined;
  if (depGroups && typeof depGroups === 'object') {
    for (const group of Object.values(depGroups)) {
      if (Array.isArray(group)) {
        for (const entry of group) {
          if (typeof entry === 'string') {
            const name = extractPkgName(entry);
            if (name && !prod.has(name)) dev.add(name);
          }
        }
      }
    }
  }

  return { prod, dev };
}
