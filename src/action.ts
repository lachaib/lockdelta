import { readFileSync, writeFileSync } from 'node:fs';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { parse } from 'yaml';
import { hidePrComment, postPrComment } from './action/comment.js';
import { applyFiltersConfig } from './action/filters.js';
import { generateMarkdown } from './action/markdown.js';
import { run } from './index.js';

const NULL_SHA = '0000000000000000000000000000000000000000';

(async () => {
  try {
    const payload = github.context.payload;

    const prNumberInput = core.getInput('pr-number');
    const prFromPayload =
      (payload.pull_request as { number?: number } | undefined)?.number ??
      (payload.number as number | undefined);
    const prNumber = prNumberInput || (prFromPayload != null ? String(prFromPayload) : '');

    const repoInput = core.getInput('repo');
    const { owner, repo: repoName } = github.context.repo;
    const repo = repoInput || (owner && repoName ? `${owner}/${repoName}` : '');

    const inputBase = core.getInput('base-ref') || undefined;
    const inputHead = core.getInput('head-ref') || undefined;

    // Fall back to PR event context only when NEITHER side is explicitly set —
    // mixing contexts (e.g. explicit base-ref + head from payload) produces wrong comparisons.
    const prBase = (payload.pull_request as { base?: { ref?: string } } | undefined)?.base?.ref;
    const prHead = (payload.pull_request as { head?: { ref?: string } } | undefined)?.head?.ref;
    const base = inputBase ?? (!inputHead ? prBase : undefined);
    const head = inputHead ?? (!inputBase ? prHead : undefined);

    // Only use push event SHAs when no explicit refs and not in PR mode.
    // baseSha/headSha take priority over base/head inside run(), so passing both
    // would silently override an explicit base-ref: input.
    const before = payload.before as string | undefined;
    const after = payload.after as string | undefined;
    const pushShas =
      !prNumber && !inputBase && !inputHead && before && after && before !== NULL_SHA
        ? { baseSha: before, headSha: after }
        : null;

    const report = await run({
      base,
      head,
      prNumber: prNumber || undefined,
      baseSha: pushShas?.baseSha,
      headSha: pushShas?.headSha,
      repo: repo || undefined,
      lockfile: core.getInput('lockfile') || undefined,
      lockfileType: core.getInput('type') || undefined,
      onNote: (msg) => core.notice(msg),
    });

    const json = JSON.stringify(report, null, 2);
    core.setOutput('diff', json);

    const hasChanges = report.summary.total_changes > 0;
    core.setOutput('has-changes', String(hasChanges));

    const jsonToFile = core.getInput('json-to-file');
    if (jsonToFile) writeFileSync(jsonToFile, json);

    const filtersInput = core.getInput('filters');
    const filtersFromPath = core.getInput('filters-from');

    if (filtersInput || filtersFromPath) {
      let fileConfig: Record<string, unknown> = {};
      if (filtersFromPath) {
        let content: string;
        try {
          content = readFileSync(filtersFromPath, 'utf-8');
        } catch {
          throw new Error(`filters-from: could not read file '${filtersFromPath}'`);
        }
        try {
          fileConfig = (parse(content) as Record<string, unknown>) ?? {};
        } catch {
          throw new Error(`filters-from: invalid YAML in '${filtersFromPath}'`);
        }
      }

      let inlineConfig: Record<string, unknown> = {};
      if (filtersInput) {
        try {
          inlineConfig = (parse(filtersInput) as Record<string, unknown>) ?? {};
        } catch {
          throw new Error('filters: invalid YAML');
        }
      }

      // Merge: inline wins on key collision
      const mergedConfig = { ...fileConfig, ...inlineConfig };
      const allChanges = report.lockfiles.flatMap((lf) => lf.changes);
      const filterResults = applyFiltersConfig(mergedConfig, allChanges);
      for (const [name, matched] of Object.entries(filterResults)) {
        core.setOutput(name, String(matched));
      }
      const changedGroups = Object.entries(filterResults)
        .filter(([, matched]) => matched)
        .map(([name]) => name);
      core.setOutput('changed-groups', JSON.stringify(changedGroups));
    }

    const wantsMarkdown = core.getInput('markdown') === 'true';
    const postCommentMode = core.getInput('post-comment');
    const shouldPost =
      postCommentMode === 'true' || (postCommentMode === 'if-changed' && hasChanges);
    const shouldHide = postCommentMode === 'if-changed' && !hasChanges;

    if (wantsMarkdown || shouldPost) {
      const md = generateMarkdown(report);

      if (wantsMarkdown) {
        core.setOutput('markdown', md);
        const markdownToFile = core.getInput('markdown-to-file');
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
    core.notice(
      `lockdelta: ${s.updated} updated, ${s.added} added, ${s.removed} removed` +
        ` (${report.lockfiles.length} lockfile(s), ecosystems: ${s.ecosystems.join(', ')})`,
    );
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
})();
