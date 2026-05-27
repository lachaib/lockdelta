import type { Ecosystem, SupportedLockfile } from '../base.js';
import { normalizeJsName, parseDirectDeps } from './package-json.js';
import { parseBunLock } from './parsers/bun.js';
import { parseNpmLock } from './parsers/npm.js';
import { parsePnpmLock } from './parsers/pnpm.js';
import { parseYarnLock } from './parsers/yarn.js';

const SUPPORTED_LOCKFILES: SupportedLockfile[] = [
  { filename: 'package-lock.json', type: 'npm' },
  { filename: 'yarn.lock', type: 'yarn' },
  { filename: 'pnpm-lock.yaml', type: 'pnpm' },
  { filename: 'bun.lock', type: 'bun' },
];

const lockfileTypeMap = new Map(SUPPORTED_LOCKFILES.map((l) => [l.filename, l.type]));

export const javascriptEcosystem: Ecosystem = {
  name: 'javascript',
  supportedLockfiles: SUPPORTED_LOCKFILES,
  manifestName: 'package.json',

  getLockfileType(filename: string): string | undefined {
    return lockfileTypeMap.get(filename);
  },

  parseLockfile(content: string, lockfileType: string): Record<string, string> {
    switch (lockfileType) {
      case 'npm':
        return parseNpmLock(content);
      case 'yarn':
        return parseYarnLock(content);
      case 'pnpm':
        return parsePnpmLock(content);
      case 'bun':
        return parseBunLock(content);
      default:
        return {};
    }
  },

  parseDirectDeps(manifestContent: string) {
    return parseDirectDeps(manifestContent);
  },

  normalizeName(name: string): string {
    return normalizeJsName(name);
  },
};
