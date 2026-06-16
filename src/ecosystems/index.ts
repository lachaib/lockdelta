import type { Ecosystem } from './base.js';
import { denoEcosystem } from './deno/index.js';
import { javascriptEcosystem } from './javascript/index.js';
import { phpEcosystem } from './php/index.js';
import { pythonEcosystem } from './python/index.js';

const registry = new Map<string, Ecosystem>();

export function registerEcosystem(ecosystem: Ecosystem): void {
  registry.set(ecosystem.name, ecosystem);
}

export function getEcosystemByName(name: string): Ecosystem | undefined {
  return registry.get(name);
}

export function getEcosystemForLockfile(filename: string): Ecosystem | undefined {
  for (const ecosystem of registry.values()) {
    if (ecosystem.getLockfileType(filename) !== undefined) return ecosystem;
  }
  return undefined;
}

export function getAllEcosystems(): Ecosystem[] {
  return [...registry.values()];
}

registerEcosystem(pythonEcosystem);
registerEcosystem(javascriptEcosystem);
registerEcosystem(denoEcosystem);
registerEcosystem(phpEcosystem);
