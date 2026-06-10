import { buildDiffReport, collectLockfileEntries } from './core/report.js';
import { gitLsTree, gitShow } from './sources/git.js';
import { detectRepo, getPrShas, ghFileAtSha, ghLsTree } from './sources/github.js';
import { readLocalFile } from './sources/local.js';
import type { DiffReport, FileSource } from './types.js';

export type { Ecosystem, SupportedLockfile } from './ecosystems/base.js';
export { registerEcosystem } from './ecosystems/index.js';
export type {
  DiffReport,
  DirectDeps,
  LockfileEntry,
  LockfilePair,
  MigrationInfo,
  PackageChange,
  PackageEntry,
} from './types.js';

export interface RunOptions {
  base?: string;
  head?: string;
  /** Explicit base commit SHA — skips getPrShas. Used for push events. */
  baseSha?: string;
  /** Explicit head commit SHA — skips getPrShas. Used for push events. */
  headSha?: string;
  prNumber?: string;
  repo?: string;
  lockfile?: string;
  lockfileType?: string;
  oldFile?: string;
  newFile?: string;
  onNote?: (message: string) => void;
}

async function resolveApiShas(
  options: RunOptions,
): Promise<{ baseSha: string; headSha: string; repo: string } | null> {
  if (options.baseSha && options.headSha) {
    return {
      baseSha: options.baseSha,
      headSha: options.headSha,
      repo: options.repo ?? detectRepo(),
    };
  }
  if (options.prNumber) {
    const repo = options.repo ?? detectRepo();
    const { baseRefOid, headRefOid } = await getPrShas(options.prNumber, repo);
    return { baseSha: baseRefOid, headSha: headRefOid, repo };
  }
  return null;
}

export async function run(options: RunOptions = {}): Promise<DiffReport> {
  const { lockfile, lockfileType, onNote } = options;

  if (options.oldFile && options.newFile) {
    const oldPath = options.oldFile;
    const newPath = options.newFile;

    const getBase: FileSource = (path) =>
      Promise.resolve(path === oldPath ? readLocalFile(oldPath) : null);
    const getHead: FileSource = (path) =>
      Promise.resolve(path === newPath ? readLocalFile(newPath) : null);

    const lockfiles = await collectLockfileEntries({
      getBase,
      getHead,
      allBasePaths: [oldPath],
      allHeadPaths: [newPath],
      lockfile: newPath,
      lockfileType,
      onNote,
    });

    if (lockfiles.length === 0) throw new Error('No supported lockfiles found');
    return buildDiffReport(lockfiles, 'local_old', 'local_new');
  }

  const apiShas = await resolveApiShas(options);

  if (apiShas) {
    const { baseSha, headSha, repo } = apiShas;

    const getBase: FileSource = (path) => ghFileAtSha(baseSha, path, repo);
    const getHead: FileSource = (path) => ghFileAtSha(headSha, path, repo);

    const [basePaths, headPaths] = await Promise.all([
      ghLsTree(baseSha, repo),
      ghLsTree(headSha, repo),
    ]);

    const lockfiles = await collectLockfileEntries({
      getBase,
      getHead,
      allBasePaths: basePaths,
      allHeadPaths: headPaths,
      lockfile,
      lockfileType,
      onNote,
    });

    if (lockfiles.length === 0) throw new Error('No supported lockfiles found');
    return buildDiffReport(lockfiles, baseSha, headSha);
  }

  // Git ref mode: local CLI usage
  const baseRef = options.base ?? 'HEAD~1';
  const headRef = options.head ?? 'HEAD';

  const getBase: FileSource = (path) => Promise.resolve(gitShow(baseRef, path));
  const getHead: FileSource = (path) => Promise.resolve(gitShow(headRef, path));

  const lockfiles = await collectLockfileEntries({
    getBase,
    getHead,
    allBasePaths: gitLsTree(baseRef),
    allHeadPaths: gitLsTree(headRef),
    lockfile,
    lockfileType,
    onNote,
  });

  if (lockfiles.length === 0) throw new Error('No supported lockfiles found');
  return buildDiffReport(lockfiles, baseRef, headRef);
}
