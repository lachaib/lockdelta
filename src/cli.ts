import { writeFileSync } from 'node:fs';
import { Command } from 'commander';
import { run } from './index.js';

const program = new Command();

program
  .name('lockdelta')
  .description('Diff dependency lockfiles between git refs, PRs, or local files')
  .version('0.1.0')
  .option(
    '--base <ref>',
    'Base git ref (default: HEAD~1). In CI, reads GITHUB_BASE_REF — may need "origin/" prefix.',
    process.env.GITHUB_BASE_REF,
  )
  .option(
    '--head <ref>',
    'Head git ref (default: HEAD). In CI, reads GITHUB_HEAD_REF.',
    process.env.GITHUB_HEAD_REF,
  )
  .option(
    '--pr <number>',
    'GitHub PR number. Fetches exact SHAs via gh CLI.',
    process.env.GITHUB_PR_NUMBER,
  )
  .option(
    '--repo <owner/name>',
    'GitHub repo in OWNER/NAME format. Auto-detected if omitted.',
    process.env.GITHUB_REPOSITORY,
  )
  .option('--lockfile <path>', 'Specific lockfile path. Auto-discovers all lockfiles if omitted.')
  .option('--type <type>', 'Force lockfile type: uv, poetry, pdm. Only used with --lockfile.')
  .option('--old <path>', 'Old lockfile path (local file comparison mode).')
  .option('--new <path>', 'New lockfile path (local file comparison mode).')
  .option('--output <path>', 'Write JSON report to file instead of stdout.')
  .action(async (opts) => {
    try {
      const report = await run({
        base: opts.base,
        head: opts.head,
        prNumber: opts.pr,
        repo: opts.repo,
        lockfile: opts.lockfile,
        lockfileType: opts.type,
        oldFile: opts.old,
        newFile: opts.new,
        onNote: (msg) => process.stderr.write(`Note: ${msg}\n`),
      });

      const json = `${JSON.stringify(report, null, 2)}\n`;

      if (opts.output) {
        writeFileSync(opts.output, json, 'utf-8');
        process.stderr.write(`Report written to ${opts.output}\n`);
      } else {
        process.stdout.write(json);
      }
    } catch (err) {
      process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

program.parse();
