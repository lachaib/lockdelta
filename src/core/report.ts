import { posix } from 'path';
import type { DiffReport, FileSource, LockfileEntry, LockfilePair } from '../types.js';
import { getEcosystemByName, getEcosystemForLockfile } from '../ecosystems/index.js';
import {
  findAllLockfiles,
  findLockfiles,
  groupByWorkspace,
  resolveLockfilePair,
} from './discovery.js';
import { diffPackages } from './diff.js';

export async function buildLockfileEntry(
  pair: LockfilePair,
  workspace: string,
  getBase: FileSource,
  getHead: FileSource,
): Promise<LockfileEntry | null> {
  const ecosystem = getEcosystemByName(pair.ecosystemName);
  if (!ecosystem) return null;

  const manifestPath = ecosystem.manifestName
    ? workspace === '.'
      ? ecosystem.manifestName
      : posix.join(workspace, ecosystem.manifestName)
    : null;

  const [oldContent, newContent, manifestContent] = await Promise.all([
    pair.basePath ? getBase(pair.basePath) : Promise.resolve(null),
    pair.headPath ? getHead(pair.headPath) : Promise.resolve(null),
    manifestPath ? getHead(manifestPath) : Promise.resolve(null),
  ]);

  const oldPkgs =
    oldContent && pair.baseType ? ecosystem.parseLockfile(oldContent, pair.baseType) : {};
  const newPkgs =
    newContent && pair.headType ? ecosystem.parseLockfile(newContent, pair.headType) : {};

  const directDeps = manifestContent
    ? ecosystem.parseDirectDeps(manifestContent)
    : { prod: new Set<string>(), dev: new Set<string>() };

  const changes = diffPackages(
    oldPkgs,
    newPkgs,
    directDeps,
    ecosystem.normalizeName.bind(ecosystem),
  );

  const added = changes.filter((c) => c.change_type === 'added').length;
  const removed = changes.filter((c) => c.change_type === 'removed').length;
  const updated = changes.filter((c) => c.change_type === 'updated').length;

  return {
    path: pair.headPath ?? pair.basePath,
    workspace,
    type: pair.headType ?? pair.baseType,
    ecosystem: pair.ecosystemName,
    summary: { added, removed, updated, total_changes: changes.length },
    changes,
    migration: pair.migrationNote
      ? {
          note: pair.migrationNote,
          base_lockfile: pair.basePath,
          base_lockfile_type: pair.baseType,
          head_lockfile: pair.headPath,
          head_lockfile_type: pair.headType,
        }
      : null,
  };
}

export interface CollectOptions {
  getBase: FileSource;
  getHead: FileSource;
  allBasePaths: string[];
  allHeadPaths: string[];
  lockfile?: string;
  lockfileType?: string;
  onNote?: (message: string) => void;
}

export async function collectLockfileEntries(options: CollectOptions): Promise<LockfileEntry[]> {
  const { getBase, getHead, allBasePaths, allHeadPaths, lockfile, lockfileType, onNote } = options;

  if (lockfile) {
    const filename = posix.basename(lockfile);
    const ecosystem = getEcosystemForLockfile(filename);
    if (!ecosystem) throw new Error(`Cannot determine ecosystem for lockfile: ${lockfile}`);
    const type = lockfileType ?? ecosystem.getLockfileType(filename);
    if (!type) throw new Error(`Cannot determine lockfile type for ${lockfile} — use --type`);
    const ws = posix.dirname(lockfile);
    const pair: LockfilePair = {
      basePath: lockfile,
      baseType: type,
      headPath: lockfile,
      headType: type,
      migrationNote: null,
      ecosystemName: ecosystem.name,
    };
    const entry = await buildLockfileEntry(
      pair,
      ws === '.' || ws === '' ? '.' : ws,
      getBase,
      getHead,
    );
    return entry ? [entry] : [];
  }

  let baseAll = findAllLockfiles(allBasePaths);
  let headAll = findAllLockfiles(allHeadPaths);

  if (baseAll.length === 0 && headAll.length === 0) {
    [baseAll, headAll] = await Promise.all([findLockfiles(getBase), findLockfiles(getHead)]);
  }

  const baseByWs = groupByWorkspace(baseAll);
  const headByWs = groupByWorkspace(headAll);
  const allWorkspaces = [...new Set([...baseByWs.keys(), ...headByWs.keys()])].sort();

  const entries = await Promise.all(
    allWorkspaces.map(async (ws) => {
      const baseFiles = baseByWs.get(ws) ?? [];
      const headFiles = headByWs.get(ws) ?? [];
      const pair = resolveLockfilePair(baseFiles, headFiles);
      if (!pair) return null;
      if (pair.migrationNote) onNote?.(`[${ws}]: ${pair.migrationNote}`);
      return buildLockfileEntry(pair, ws, getBase, getHead);
    }),
  );

  return entries.filter((e): e is LockfileEntry => e !== null);
}

export function buildDiffReport(
  lockfiles: LockfileEntry[],
  baseRef: string,
  headRef: string,
): DiffReport {
  const totalAdded = lockfiles.reduce((sum, lf) => sum + lf.summary.added, 0);
  const totalRemoved = lockfiles.reduce((sum, lf) => sum + lf.summary.removed, 0);
  const totalUpdated = lockfiles.reduce((sum, lf) => sum + lf.summary.updated, 0);
  const ecosystems = [...new Set(lockfiles.map((lf) => lf.ecosystem))].sort();

  return {
    schema_version: '1',
    generated_at: new Date().toISOString(),
    base_ref: baseRef,
    head_ref: headRef,
    summary: {
      added: totalAdded,
      removed: totalRemoved,
      updated: totalUpdated,
      total_changes: totalAdded + totalRemoved + totalUpdated,
      ecosystems,
    },
    lockfiles,
  };
}
