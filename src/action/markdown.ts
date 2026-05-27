import type { DiffReport, PackageChange } from '../types.js';

function packageUrl(ecosystem: string, name: string): string | null {
  switch (ecosystem) {
    case 'python':
      return `https://pypi.org/project/${name}/`;
    case 'javascript':
      return `https://www.npmjs.com/package/${encodeURIComponent(name)}`;
    case 'deno':
      if (name.startsWith('jsr:')) return `https://jsr.io/${name.slice(4)}`;
      return `https://www.npmjs.com/package/${encodeURIComponent(name)}`;
    default:
      return null;
  }
}

function formatName(change: PackageChange, ecosystem: string): string {
  const url = packageUrl(ecosystem, change.name);
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
