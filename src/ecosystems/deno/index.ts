import type { Ecosystem, SupportedLockfile } from '../base.js';
import { normalizeDenoName, parseDirectDeps } from './deno-json.js';
import { parseDenoLock } from './parsers/deno-lock.js';

const SUPPORTED_LOCKFILES: SupportedLockfile[] = [{ filename: 'deno.lock', type: 'deno' }];

export const denoEcosystem: Ecosystem = {
  name: 'deno',
  supportedLockfiles: SUPPORTED_LOCKFILES,
  manifestName: 'deno.json',

  getLockfileType(filename: string): string | undefined {
    return filename === 'deno.lock' ? 'deno' : undefined;
  },

  parseLockfile(content: string, _lockfileType: string): Record<string, string> {
    return parseDenoLock(content);
  },

  parseDirectDeps(manifestContent: string) {
    return parseDirectDeps(manifestContent);
  },

  normalizeName(name: string): string {
    return normalizeDenoName(name);
  },
};
