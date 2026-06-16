import type { Ecosystem, SupportedLockfile } from '../base.js';
import { normalizeComposerName, parseDirectDeps } from './composer-json.js';
import { parseComposerLock } from './parsers/composer.js';

const SUPPORTED_LOCKFILES: SupportedLockfile[] = [{ filename: 'composer.lock', type: 'composer' }];

const lockfileTypeMap = new Map(SUPPORTED_LOCKFILES.map((l) => [l.filename, l.type]));

export const phpEcosystem: Ecosystem = {
  name: 'php',
  supportedLockfiles: SUPPORTED_LOCKFILES,
  manifestName: 'composer.json',

  getLockfileType(filename: string): string | undefined {
    return lockfileTypeMap.get(filename);
  },

  parseLockfile(content: string, _lockfileType: string) {
    return parseComposerLock(content);
  },

  parseDirectDeps(manifestContent: string) {
    return parseDirectDeps(manifestContent);
  },

  normalizeName(name: string): string {
    return normalizeComposerName(name);
  },
};
