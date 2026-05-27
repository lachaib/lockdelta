type ChangeType = 'added' | 'removed' | 'updated';
interface DirectDeps {
    prod: Set<string>;
    dev: Set<string>;
}
interface PackageChange {
    name: string;
    change_type: ChangeType;
    old_version: string | null;
    new_version: string | null;
    is_direct: boolean;
    is_dev: boolean;
}
interface MigrationInfo {
    note: string;
    base_lockfile: string | null;
    base_lockfile_type: string | null;
    head_lockfile: string | null;
    head_lockfile_type: string | null;
}
interface LockfileSummary {
    added: number;
    removed: number;
    updated: number;
    total_changes: number;
}
interface LockfileEntry {
    path: string | null;
    workspace: string;
    type: string | null;
    ecosystem: string;
    summary: LockfileSummary;
    changes: PackageChange[];
    migration: MigrationInfo | null;
}
interface DiffSummary {
    added: number;
    removed: number;
    updated: number;
    total_changes: number;
    ecosystems: string[];
}
interface DiffReport {
    schema_version: '1';
    generated_at: string;
    base_ref: string;
    head_ref: string;
    summary: DiffSummary;
    lockfiles: LockfileEntry[];
}
interface LockfilePair {
    basePath: string | null;
    baseType: string | null;
    headPath: string | null;
    headType: string | null;
    migrationNote: string | null;
    ecosystemName: string;
}

interface SupportedLockfile {
    filename: string;
    type: string;
}
interface Ecosystem {
    readonly name: string;
    readonly supportedLockfiles: ReadonlyArray<SupportedLockfile>;
    readonly manifestName: string | null;
    getLockfileType(filename: string): string | undefined;
    parseLockfile(content: string, lockfileType: string): Record<string, string>;
    parseDirectDeps(manifestContent: string): DirectDeps;
    normalizeName(name: string): string;
}

declare function registerEcosystem(ecosystem: Ecosystem): void;

interface RunOptions {
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
declare function run(options?: RunOptions): Promise<DiffReport>;

export { type DiffReport, type Ecosystem, type LockfileEntry, type LockfilePair, type MigrationInfo, type PackageChange, type RunOptions, type SupportedLockfile, registerEcosystem, run };
