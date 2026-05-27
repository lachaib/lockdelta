export type ChangeType = 'added' | 'removed' | 'updated';

export interface DirectDeps {
  prod: Set<string>;
  dev: Set<string>;
}

export interface PackageChange {
  name: string;
  change_type: ChangeType;
  old_version: string | null;
  new_version: string | null;
  is_direct: boolean;
  is_dev: boolean;
}

export interface MigrationInfo {
  note: string;
  base_lockfile: string | null;
  base_lockfile_type: string | null;
  head_lockfile: string | null;
  head_lockfile_type: string | null;
}

export interface LockfileSummary {
  added: number;
  removed: number;
  updated: number;
  total_changes: number;
}

export interface LockfileEntry {
  path: string | null;
  workspace: string;
  type: string | null;
  ecosystem: string;
  summary: LockfileSummary;
  changes: PackageChange[];
  migration: MigrationInfo | null;
}

export interface DiffSummary {
  added: number;
  removed: number;
  updated: number;
  total_changes: number;
  ecosystems: string[];
}

export interface DiffReport {
  schema_version: '1';
  generated_at: string;
  base_ref: string;
  head_ref: string;
  summary: DiffSummary;
  lockfiles: LockfileEntry[];
}

export interface LockfilePair {
  basePath: string | null;
  baseType: string | null;
  headPath: string | null;
  headType: string | null;
  migrationNote: string | null;
  ecosystemName: string;
}

export type FileSource = (path: string) => Promise<string | null>;
