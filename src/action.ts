import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
import { hidePrComment, postPrComment } from './action/comment.js';
import { applyFiltersConfig } from './action/filters.js';
import { generateMarkdown, type RegistryMap } from './action/markdown.js';
import { run } from './index.js';

function getInput(name: string): string {
  return (process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] ?? '').trim();
}

function setOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    const delimiter = `DEPDIFF_${Math.random().toString(36).slice(2).toUpperCase()}`;
    appendFileSync(outputFile, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
  } else {
    process.stdout.write(`::set-output name=${name}::${value}\n`);
  }
}

function logError(message: string): void {
  process.stdout.write(`::error::${message}\n`);
}

function logNotice(message: string): void {
  process.stdout.write(`::notice::${message}\n`);
}

function readEventPayload(): Record<string, unknown> | null {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  try {
    return JSON.parse(readFileSync(eventPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function detectPrNumber(): string {
  const event = readEventPayload();
  if (!event) return '';
  const pr = event.pull_request as { number?: number } | undefined;
  const num = pr?.number ?? (event.number as number | undefined);
  return num != null ? String(num) : '';
}

const NULL_SHA = '0000000000000000000000000000000000000000';

function detectPushShas(): { baseSha: string; headSha: string } | null {
  const event = readEventPayload();
  if (!event) return null;
  const before = event.before as string | undefined;
  const after = event.after as string | undefined;
  if (!before || !after || before === NULL_SHA) return null;
  return { baseSha: before, headSha: after };
}

(async () => {
  try {
    const prNumber = getInput('pr-number') || detectPrNumber();
    const repo = getInput('repo') || process.env.GITHUB_REPOSITORY || '';

    const inputBase = getInput('base-ref') || undefined;
    const inputHead = getInput('head-ref') || undefined;

    // Fall back to PR event env vars only when NEITHER side is explicitly set —
    // mixing contexts (e.g. explicit base-ref + GITHUB_HEAD_REF) produces wrong comparisons.
    const base = inputBase ?? (!inputHead ? process.env.GITHUB_BASE_REF || undefined : undefined);
    const head = inputHead ?? (!inputBase ? process.env.GITHUB_HEAD_REF || undefined : undefined);

    // Only use push event SHAs when no explicit refs and not in PR mode.
    // baseSha/headSha take priority over base/head inside run(), so passing both
    // would silently override an explicit base-ref: input.
    const pushShas = !prNumber && !inputBase && !inputHead ? detectPushShas() : null;

    const report = await run({
      base,
      head,
      prNumber: prNumber || undefined,
      baseSha: pushShas?.baseSha,
      headSha: pushShas?.headSha,
      repo: repo || undefined,
      lockfile: getInput('lockfile') || undefined,
      lockfileType: getInput('type') || undefined,
      onNote: logNotice,
    });

    const json = JSON.stringify(report, null, 2);
    setOutput('diff', json);

    const hasChanges = report.summary.total_changes > 0;
    setOutput('has-changes', String(hasChanges));

    const jsonToFile = getInput('json-to-file');
    if (jsonToFile) writeFileSync(jsonToFile, json);

    const filtersInput = getInput('filters');
    const filtersFromPath = getInput('filters-from');

    if (filtersInput || filtersFromPath) {
      let fileConfig: Record<string, unknown> = {};
      if (filtersFromPath) {
        let content: string;
        try {
          content = readFileSync(filtersFromPath, 'utf-8');
        } catch {
          logError(`filters-from: could not read file '${filtersFromPath}'`);
          process.exit(1);
        }
        try {
          fileConfig = (parse(content!) as Record<string, unknown>) ?? {};
        } catch {
          logError(`filters-from: invalid YAML in '${filtersFromPath}'`);
          process.exit(1);
        }
      }

      let inlineConfig: Record<string, unknown> = {};
      if (filtersInput) {
        try {
          inlineConfig = (parse(filtersInput) as Record<string, unknown>) ?? {};
        } catch {
          logError('filters: invalid YAML');
          process.exit(1);
        }
      }

      // Merge: inline wins on key collision
      const mergedConfig = { ...fileConfig, ...inlineConfig };
      const allChanges = report.lockfiles.flatMap((lf) => lf.changes);
      const filterResults = applyFiltersConfig(mergedConfig, allChanges);
      for (const [name, matched] of Object.entries(filterResults)) {
        setOutput(name, String(matched));
      }
      const changedGroups = Object.entries(filterResults)
        .filter(([, matched]) => matched)
        .map(([name]) => name);
      setOutput('changed-groups', JSON.stringify(changedGroups));
    }

    const wantsMarkdown = getInput('markdown') === 'true';
    const postCommentMode = getInput('post-comment'); // 'false' | 'true' | 'if-changed'
    const shouldPost =
      postCommentMode === 'true' || (postCommentMode === 'if-changed' && hasChanges);
    const shouldHide = postCommentMode === 'if-changed' && !hasChanges;

    let registryMap: RegistryMap | undefined;
    const registryMapInput = getInput('registry-map');
    if (registryMapInput) {
      let parsed: unknown;
      try {
        parsed = parse(registryMapInput);
      } catch {
        logError('registry-map: invalid YAML');
        process.exit(1);
      }
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed) ||
        !Object.values(parsed).every((v) => typeof v === 'string')
      ) {
        logError('registry-map: must be a YAML map of string keys to string URL templates');
        process.exit(1);
      }
      registryMap = parsed as RegistryMap;
    }

    if (wantsMarkdown || shouldPost) {
      const md = generateMarkdown(report, registryMap);

      if (wantsMarkdown) {
        setOutput('markdown', md);
        const markdownToFile = getInput('markdown-to-file');
        if (markdownToFile) writeFileSync(markdownToFile, md);
      }

      if (shouldPost) {
        await postPrComment(md, prNumber, repo || undefined);
      }
    }

    if (shouldHide) {
      await hidePrComment(prNumber, repo || undefined);
    }

    const s = report.summary;
    logNotice(
      `lockdelta: ${s.updated} updated, ${s.added} added, ${s.removed} removed` +
        ` (${report.lockfiles.length} lockfile(s), ecosystems: ${s.ecosystems.join(', ')})`,
    );
  } catch (err) {
    logError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
})();
