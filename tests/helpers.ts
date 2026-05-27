import type { DirectDeps } from '../src/types.js';

export function directDeps(prod: string[], dev: string[] = []): DirectDeps {
  return { prod: new Set(prod), dev: new Set(dev) };
}
