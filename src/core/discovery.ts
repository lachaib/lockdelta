import { posix } from 'path';
import type { FileSource, LockfilePair } from '../types.js';
import { getAllEcosystems, getEcosystemForLockfile } from '../ecosystems/index.js';

export interface LockfileInfo {
  path: string;
  type: string;
  ecosystemName: string;
}

export function workspaceFromPath(filePath: string): string {
  const parent = posix.dirname(filePath);
  return parent === '.' || parent === '' ? '.' : parent;
}

export function detectLockfileInfo(filePath: string): LockfileInfo | null {
  const filename = posix.basename(filePath);
  const ecosystem = getEcosystemForLockfile(filename);
  if (!ecosystem) return null;
  const type = ecosystem.getLockfileType(filename);
  if (!type) return null;
  return { path: filePath, type, ecosystemName: ecosystem.name };
}

export function findAllLockfiles(paths: string[]): LockfileInfo[] {
  return paths.flatMap((p) => {
    const info = detectLockfileInfo(p);
    return info ? [info] : [];
  });
}

export async function findLockfiles(getFile: FileSource): Promise<LockfileInfo[]> {
  const candidates = getAllEcosystems().flatMap((ecosystem) =>
    ecosystem.supportedLockfiles.map(({ filename, type }) => ({
      filename,
      type,
      ecosystemName: ecosystem.name,
    })),
  );

  const results = await Promise.all(
    candidates.map(async ({ filename, type, ecosystemName }) => {
      const content = await getFile(filename);
      return content !== null ? ({ path: filename, type, ecosystemName } as LockfileInfo) : null;
    }),
  );

  return results.filter((r): r is LockfileInfo => r !== null);
}

export function groupByWorkspace(lockfiles: LockfileInfo[]): Map<string, LockfileInfo[]> {
  const result = new Map<string, LockfileInfo[]>();
  for (const lf of lockfiles) {
    const ws = workspaceFromPath(lf.path);
    const existing = result.get(ws) ?? [];
    existing.push(lf);
    result.set(ws, existing);
  }
  return result;
}

const LOCKFILE_PRIORITY: Record<string, number> = {
  'uv.lock': 0,
  'poetry.lock': 1,
  'pdm.lock': 2,
};

function lockfilePriority(path: string): number {
  return LOCKFILE_PRIORITY[posix.basename(path)] ?? 99;
}

export function resolveLockfilePair(
  baseFiles: LockfileInfo[],
  headFiles: LockfileInfo[],
): LockfilePair | null {
  const headByPath = new Map(headFiles.map((f) => [f.path, f]));
  const common = baseFiles.filter((f) => headByPath.has(f.path));

  if (common.length > 0) {
    const chosen = common.sort((a, b) => lockfilePriority(a.path) - lockfilePriority(b.path))[0];
    return {
      basePath: chosen.path,
      baseType: chosen.type,
      headPath: chosen.path,
      headType: headByPath.get(chosen.path)!.type,
      migrationNote: null,
      ecosystemName: chosen.ecosystemName,
    };
  }

  if (baseFiles.length > 0 && headFiles.length > 0) {
    const base = baseFiles[0];
    const head = headFiles[0];
    return {
      basePath: base.path,
      baseType: base.type,
      headPath: head.path,
      headType: head.type,
      migrationNote: `lockfile migration: ${posix.basename(base.path)} (${base.type}) → ${posix.basename(head.path)} (${head.type})`,
      ecosystemName: head.ecosystemName,
    };
  }

  if (headFiles.length > 0) {
    const head = headFiles[0];
    return {
      basePath: null,
      baseType: null,
      headPath: head.path,
      headType: head.type,
      migrationNote: `new lockfile added: ${posix.basename(head.path)} (${head.type})`,
      ecosystemName: head.ecosystemName,
    };
  }

  if (baseFiles.length > 0) {
    const base = baseFiles[0];
    return {
      basePath: base.path,
      baseType: base.type,
      headPath: null,
      headType: null,
      migrationNote: `lockfile removed: ${posix.basename(base.path)} (${base.type})`,
      ecosystemName: base.ecosystemName,
    };
  }

  return null;
}
