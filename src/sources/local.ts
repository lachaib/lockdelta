import { readFileSync } from 'fs';

export function readLocalFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}
