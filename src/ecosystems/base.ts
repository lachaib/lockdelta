import type { DirectDeps, PackageEntry } from '../types.js';

export interface SupportedLockfile {
  filename: string;
  type: string;
}

export interface Ecosystem {
  readonly name: string;
  readonly supportedLockfiles: ReadonlyArray<SupportedLockfile>;
  readonly manifestName: string | null;

  getLockfileType(filename: string): string | undefined;
  parseLockfile(content: string, lockfileType: string): Record<string, PackageEntry>;
  parseDirectDeps(manifestContent: string): DirectDeps;
  normalizeName(name: string): string;
}
