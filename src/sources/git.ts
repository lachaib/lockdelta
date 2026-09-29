import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export function gitShow(ref: string, path: string): string | null {
  try {
    const result = execFileSync('git', ['show', `${ref}:${path}`], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result || null;
  } catch {
    return null;
  }
}

export function gitLsTree(ref: string): string[] {
  try {
    const result = execFileSync('git', ['ls-tree', '-r', '--name-only', ref], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/** Tracked and untracked (non-ignored) files present in the working tree. */
export function gitLsFiles(): string[] {
  try {
    const result = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result
      .trim()
      .split('\n')
      .filter((p) => p && existsSync(p));
  } catch {
    return [];
  }
}
