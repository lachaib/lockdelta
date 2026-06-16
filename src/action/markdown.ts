import type { DiffReport, PackageChange } from '../types.js';

const PUBLIC_NPM_ORIGINS = new Set(['https://registry.npmjs.org', 'https://registry.yarnpkg.com']);
const PUBLIC_PYPI_ORIGIN = 'https://pypi.org';
// Packagist packages reference GitHub CDN in dist.url, not packagist.org itself
const PUBLIC_PACKAGIST_DIST_ORIGINS = new Set([
  'https://api.github.com',
  'https://codeload.github.com',
]);

function packageUrl(ecosystem: string, name: string, registryUrl?: string): string | null {
  if (registryUrl !== undefined) {
    let origin: string;
    try {
      origin = new URL(registryUrl).origin;
    } catch {
      return null;
    }

    const isNpmLike =
      ecosystem === 'javascript' || (ecosystem === 'deno' && !name.startsWith('jsr:'));
    if (isNpmLike) {
      if (!PUBLIC_NPM_ORIGINS.has(origin)) {
        // GitHub Packages scoped packages link to their GitHub repo page
        if (origin === 'https://npm.pkg.github.com' && name.startsWith('@')) {
          const parts = name.slice(1).split('/');
          if (parts.length === 2)
            return `https://github.com/orgs/${parts[0]}/packages/npm/package/${parts[1]}`;
        }
        return null;
      }
    } else if (ecosystem === 'python') {
      if (!origin.startsWith(PUBLIC_PYPI_ORIGIN)) {
        return null;
      }
    } else if (ecosystem === 'php') {
      if (!PUBLIC_PACKAGIST_DIST_ORIGINS.has(origin)) {
        return null;
      }
    }
  }

  switch (ecosystem) {
    case 'python':
      return `https://pypi.org/project/${name}/`;
    case 'javascript':
      return `https://www.npmjs.com/package/${encodeURIComponent(name)}`;
    case 'deno':
      if (name.startsWith('jsr:')) return `https://jsr.io/${name.slice(4)}`;
      return `https://www.npmjs.com/package/${encodeURIComponent(name)}`;
    case 'php':
      return `https://packagist.org/packages/${name}`;
    default:
      return null;
  }
}

function formatName(change: PackageChange, ecosystem: string): string {
  // Use the new registry for added/updated, old registry for removed
  const url = packageUrl(
    ecosystem,
    change.name,
    change.new_registry_url ?? change.old_registry_url,
  );
  const linked = url ? `[${change.name}](${url})` : change.name;
  if (change.is_direct && !change.is_dev) return `**${linked}**`;
  if (change.is_dev) return `*${linked}*`;
  return linked;
}

function formatLine(change: PackageChange, ecosystem: string): string {
  const name = formatName(change, ecosystem);
  if (change.change_type === 'updated') {
    return `- ${name}: \`${change.old_version}\` → \`${change.new_version}\``;
  }
  if (change.change_type === 'added') {
    return `- ${name}: \`${change.new_version}\``;
  }
  return `- ${name}: \`${change.old_version}\``;
}

export function generateMarkdown(report: DiffReport): string {
  const added: Array<{ change: PackageChange; ecosystem: string }> = [];
  const updated: Array<{ change: PackageChange; ecosystem: string }> = [];
  const removed: Array<{ change: PackageChange; ecosystem: string }> = [];

  for (const lf of report.lockfiles) {
    for (const change of lf.changes) {
      const entry = { change, ecosystem: lf.ecosystem };
      if (change.change_type === 'added') added.push(entry);
      else if (change.change_type === 'updated') updated.push(entry);
      else removed.push(entry);
    }
  }

  const fmt = ({ change, ecosystem }: { change: PackageChange; ecosystem: string }) =>
    formatLine(change, ecosystem);

  const sections: string[] = [];
  if (added.length > 0) sections.push(`### Added\n\n${added.map(fmt).join('\n')}`);
  if (updated.length > 0) sections.push(`### Changed\n\n${updated.map(fmt).join('\n')}`);
  if (removed.length > 0) sections.push(`### Removed\n\n${removed.map(fmt).join('\n')}`);

  return sections.join('\n\n');
}
