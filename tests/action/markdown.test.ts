import { describe, expect, it } from 'vitest';
import { generateMarkdown } from '../../src/action/markdown.js';
import type { DiffReport, PackageChange } from '../../src/types.js';

function makeReport(changes: PackageChange[], ecosystem = 'python'): DiffReport {
  return {
    schema_version: '1',
    generated_at: '2024-01-01T00:00:00.000Z',
    base_ref: 'main',
    head_ref: 'feature',
    summary: {
      added: changes.filter((c) => c.change_type === 'added').length,
      removed: changes.filter((c) => c.change_type === 'removed').length,
      updated: changes.filter((c) => c.change_type === 'updated').length,
      total_changes: changes.length,
      ecosystems: [ecosystem],
    },
    lockfiles: [
      {
        path: 'uv.lock',
        workspace: '.',
        type: 'uv',
        ecosystem,
        summary: { added: 0, removed: 0, updated: 0, total_changes: 0 },
        changes,
        migration: null,
      },
    ],
  };
}

describe('generateMarkdown', () => {
  it('returns empty string when no changes', () => {
    expect(generateMarkdown(makeReport([]))).toBe('');
  });

  it('formats added packages with version', () => {
    const changes: PackageChange[] = [
      {
        name: 'httpx',
        change_type: 'added',
        old_version: null,
        new_version: '0.27.0',
        is_direct: false,
        is_dev: false,
      },
    ];
    const md = generateMarkdown(makeReport(changes));
    expect(md).toContain('### Added');
    expect(md).toContain('httpx');
    expect(md).toContain('`0.27.0`');
  });

  it('formats updated packages with old → new versions', () => {
    const changes: PackageChange[] = [
      {
        name: 'requests',
        change_type: 'updated',
        old_version: '2.31.0',
        new_version: '2.32.3',
        is_direct: false,
        is_dev: false,
      },
    ];
    const md = generateMarkdown(makeReport(changes));
    expect(md).toContain('### Changed');
    expect(md).toContain('`2.31.0` → `2.32.3`');
  });

  it('formats removed packages with old version', () => {
    const changes: PackageChange[] = [
      {
        name: 'urllib3',
        change_type: 'removed',
        old_version: '1.26.15',
        new_version: null,
        is_direct: false,
        is_dev: false,
      },
    ];
    const md = generateMarkdown(makeReport(changes));
    expect(md).toContain('### Removed');
    expect(md).toContain('`1.26.15`');
  });

  it('bolds direct prod dependencies', () => {
    const changes: PackageChange[] = [
      {
        name: 'requests',
        change_type: 'updated',
        old_version: '2.31.0',
        new_version: '2.32.3',
        is_direct: true,
        is_dev: false,
      },
    ];
    const md = generateMarkdown(makeReport(changes));
    expect(md).toContain('**[requests]');
  });

  it('italicizes dev dependencies', () => {
    const changes: PackageChange[] = [
      {
        name: 'pytest',
        change_type: 'updated',
        old_version: '8.0.0',
        new_version: '8.1.0',
        is_direct: true,
        is_dev: true,
      },
    ];
    const md = generateMarkdown(makeReport(changes));
    expect(md).toContain('*[pytest]');
    expect(md).not.toContain('**[pytest]');
  });

  it('leaves transitive deps as plain links', () => {
    const changes: PackageChange[] = [
      {
        name: 'urllib3',
        change_type: 'updated',
        old_version: '2.2.1',
        new_version: '2.2.2',
        is_direct: false,
        is_dev: false,
      },
    ];
    const md = generateMarkdown(makeReport(changes));
    expect(md).toContain('[urllib3]');
    expect(md).not.toContain('**[urllib3]');
    expect(md).not.toContain('*[urllib3]');
  });

  it('links python packages to PyPI', () => {
    const changes: PackageChange[] = [
      {
        name: 'requests',
        change_type: 'updated',
        old_version: '2.31.0',
        new_version: '2.32.3',
        is_direct: false,
        is_dev: false,
      },
    ];
    const md = generateMarkdown(makeReport(changes, 'python'));
    expect(md).toContain('[requests](https://pypi.org/project/requests/)');
  });

  it('links javascript packages to npmjs', () => {
    const changes: PackageChange[] = [
      {
        name: 'express',
        change_type: 'updated',
        old_version: '4.18.2',
        new_version: '4.19.2',
        is_direct: false,
        is_dev: false,
      },
    ];
    const md = generateMarkdown(makeReport(changes, 'javascript'));
    expect(md).toContain('[express](https://www.npmjs.com/package/express)');
  });

  it('links scoped npm packages correctly', () => {
    const changes: PackageChange[] = [
      {
        name: '@babel/core',
        change_type: 'updated',
        old_version: '7.23.9',
        new_version: '7.24.5',
        is_direct: false,
        is_dev: false,
      },
    ];
    const md = generateMarkdown(makeReport(changes, 'javascript'));
    expect(md).toContain('[@babel/core](https://www.npmjs.com/package/%40babel%2Fcore)');
  });

  it('omits link for private python registry packages', () => {
    const changes: PackageChange[] = [
      {
        name: 'internal-pkg',
        change_type: 'updated',
        old_version: '1.0.0',
        new_version: '1.1.0',
        is_direct: false,
        is_dev: false,
        new_registry_url: 'https://private.example.com',
      },
    ];
    const md = generateMarkdown(makeReport(changes, 'python'));
    expect(md).toContain('internal-pkg');
    expect(md).not.toContain('](');
  });

  it('omits link for unknown private npm registry packages', () => {
    const changes: PackageChange[] = [
      {
        name: 'internal-lib',
        change_type: 'added',
        old_version: null,
        new_version: '2.0.0',
        is_direct: false,
        is_dev: false,
        new_registry_url: 'https://verdaccio.company.com',
      },
    ];
    const md = generateMarkdown(makeReport(changes, 'javascript'));
    expect(md).toContain('internal-lib');
    expect(md).not.toContain('](');
  });

  it('links GitHub Packages scoped packages to github.com', () => {
    const changes: PackageChange[] = [
      {
        name: '@myorg/private-pkg',
        change_type: 'updated',
        old_version: '1.0.0',
        new_version: '2.0.0',
        is_direct: false,
        is_dev: false,
        new_registry_url: 'https://npm.pkg.github.com',
      },
    ];
    const md = generateMarkdown(makeReport(changes, 'javascript'));
    expect(md).toContain('[@myorg/private-pkg](https://github.com/myorg/private-pkg)');
  });

  it('still links public npm packages when registry_url is the npm registry origin', () => {
    const changes: PackageChange[] = [
      {
        name: 'express',
        change_type: 'updated',
        old_version: '4.18.2',
        new_version: '4.19.2',
        is_direct: false,
        is_dev: false,
        new_registry_url: 'https://registry.npmjs.org',
      },
    ];
    const md = generateMarkdown(makeReport(changes, 'javascript'));
    expect(md).toContain('[express](https://www.npmjs.com/package/express)');
  });

  it('still links public python packages when registry_url is pypi.org origin', () => {
    const changes: PackageChange[] = [
      {
        name: 'requests',
        change_type: 'updated',
        old_version: '2.31.0',
        new_version: '2.32.3',
        is_direct: false,
        is_dev: false,
        new_registry_url: 'https://pypi.org',
      },
    ];
    const md = generateMarkdown(makeReport(changes, 'python'));
    expect(md).toContain('[requests](https://pypi.org/project/requests/)');
  });

  it('links deno jsr packages to jsr.io', () => {
    const changes: PackageChange[] = [
      {
        name: 'jsr:@std/path',
        change_type: 'updated',
        old_version: '0.224.0',
        new_version: '0.225.2',
        is_direct: false,
        is_dev: false,
      },
    ];
    const md = generateMarkdown(makeReport(changes, 'deno'));
    expect(md).toContain('[jsr:@std/path](https://jsr.io/@std/path)');
  });

  it('includes all three sections when all change types are present', () => {
    const changes: PackageChange[] = [
      {
        name: 'added-pkg',
        change_type: 'added',
        old_version: null,
        new_version: '1.0.0',
        is_direct: false,
        is_dev: false,
      },
      {
        name: 'updated-pkg',
        change_type: 'updated',
        old_version: '1.0.0',
        new_version: '2.0.0',
        is_direct: false,
        is_dev: false,
      },
      {
        name: 'removed-pkg',
        change_type: 'removed',
        old_version: '1.0.0',
        new_version: null,
        is_direct: false,
        is_dev: false,
      },
    ];
    const md = generateMarkdown(makeReport(changes));
    expect(md).toContain('### Added');
    expect(md).toContain('### Changed');
    expect(md).toContain('### Removed');
  });

  it('omits sections that have no changes', () => {
    const changes: PackageChange[] = [
      {
        name: 'httpx',
        change_type: 'added',
        old_version: null,
        new_version: '0.27.0',
        is_direct: false,
        is_dev: false,
      },
    ];
    const md = generateMarkdown(makeReport(changes));
    expect(md).not.toContain('### Changed');
    expect(md).not.toContain('### Removed');
  });

  it('flattens changes from multiple lockfiles with per-ecosystem links', () => {
    const report: DiffReport = {
      schema_version: '1',
      generated_at: '2024-01-01T00:00:00.000Z',
      base_ref: 'main',
      head_ref: 'feature',
      summary: {
        added: 2,
        removed: 0,
        updated: 0,
        total_changes: 2,
        ecosystems: ['python', 'javascript'],
      },
      lockfiles: [
        {
          path: 'uv.lock',
          workspace: '.',
          type: 'uv',
          ecosystem: 'python',
          summary: { added: 1, removed: 0, updated: 0, total_changes: 1 },
          changes: [
            {
              name: 'httpx',
              change_type: 'added',
              old_version: null,
              new_version: '0.27.0',
              is_direct: false,
              is_dev: false,
            },
          ],
          migration: null,
        },
        {
          path: 'package-lock.json',
          workspace: '.',
          type: 'npm',
          ecosystem: 'javascript',
          summary: { added: 1, removed: 0, updated: 0, total_changes: 1 },
          changes: [
            {
              name: 'axios',
              change_type: 'added',
              old_version: null,
              new_version: '1.7.0',
              is_direct: false,
              is_dev: false,
            },
          ],
          migration: null,
        },
      ],
    };
    const md = generateMarkdown(report);
    expect(md).toContain('pypi.org/project/httpx');
    expect(md).toContain('npmjs.com/package/axios');
  });
});
