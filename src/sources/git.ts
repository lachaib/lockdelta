import { execFileSync } from 'child_process';

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
    return result
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}
