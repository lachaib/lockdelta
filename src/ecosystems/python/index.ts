import type { Ecosystem, SupportedLockfile } from '../base.js';
import { parseTomlPackages } from './parsers/toml.js';
import { normalizePythonName, parseDirectDeps } from './pyproject.js';

const SUPPORTED_LOCKFILES: SupportedLockfile[] = [
  { filename: 'uv.lock', type: 'uv' },
  { filename: 'poetry.lock', type: 'poetry' },
  { filename: 'pdm.lock', type: 'pdm' },
  { filename: 'pylock.toml', type: 'pylock' }, // PEP 751
];

const lockfileTypeMap = new Map(SUPPORTED_LOCKFILES.map((l) => [l.filename, l.type]));

export const pythonEcosystem: Ecosystem = {
  name: 'python',
  supportedLockfiles: SUPPORTED_LOCKFILES,
  manifestName: 'pyproject.toml',

  getLockfileType(filename: string): string | undefined {
    return lockfileTypeMap.get(filename);
  },

  parseLockfile(content: string, _lockfileType: string) {
    return parseTomlPackages(content);
  },

  parseDirectDeps(manifestContent: string) {
    return parseDirectDeps(manifestContent);
  },

  normalizeName(name: string): string {
    return normalizePythonName(name);
  },
};
