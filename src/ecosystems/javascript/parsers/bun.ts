interface BunLock {
  lockfileVersion?: number;
  packages?: Record<string, unknown[]>;
}

export function parseBunLock(content: string): Record<string, string> {
  const data = JSON.parse(content) as BunLock;
  const result: Record<string, string> = {};

  for (const [name, entry] of Object.entries(data.packages ?? {})) {
    if (!Array.isArray(entry)) continue;
    const nameAtVersion = entry[0];
    if (typeof nameAtVersion !== 'string') continue;

    const version = extractVersion(nameAtVersion);
    if (!version || version.startsWith('workspace:')) continue;

    result[name] = version;
  }

  return result;
}

function extractVersion(nameAtVersion: string): string {
  // Format: "name@version" or "@scope/name@version"
  if (nameAtVersion.startsWith('@')) {
    const atIdx = nameAtVersion.indexOf('@', 1);
    return atIdx > 0 ? nameAtVersion.slice(atIdx + 1) : '';
  }
  const atIdx = nameAtVersion.indexOf('@');
  return atIdx > 0 ? nameAtVersion.slice(atIdx + 1) : '';
}
