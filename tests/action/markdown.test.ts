import { describe, expect, it } from 'vitest';
import { generateMarkdown, type RegistryMap } from '../../src/action/markdown.js';
import type { DiffReport, PackageChange } from '../../src/types.js';

function makeChange(
  overrides: Partial<PackageChange> & Pick<PackageChange, 'name'>,
): PackageChange {
  return {
    change_type: 'updated',
    old_version: '1.0.0',
    new_version: '2.0.0',
    is_direct: false,
    is_dev: false,
    ...overrides,
  };
}

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
    const md = generateMarkdown(
      makeReport([
        makeChange({
          name: 'httpx',
          change_type: 'added',
          old_version: null,
          new_version: '0.27.0',
        }),
      ]),
    );
    expect(md).toContain('### Added');
    expect(md).toContain('httpx');
    expect(md).toContain('`0.27.0`');
  });

  it('formats updated packages with old → new versions', () => {
    const md = generateMarkdown(
      makeReport([makeChange({ name: 'requests', old_version: '2.31.0', new_version: '2.32.3' })]),
    );
    expect(md).toContain('### Changed');
    expect(md).toContain('`2.31.0` → `2.32.3`');
  });

  it('formats removed packages with old version', () => {
    const md = generateMarkdown(
      makeReport([
        makeChange({
          name: 'urllib3',
          change_type: 'removed',
          old_version: '1.26.15',
          new_version: null,
        }),
      ]),
    );
    expect(md).toContain('### Removed');
    expect(md).toContain('`1.26.15`');
  });

  it('bolds direct prod dependencies', () => {
    const md = generateMarkdown(
      makeReport([
        makeChange({
          name: 'requests',
          old_version: '2.31.0',
          new_version: '2.32.3',
          is_direct: true,
        }),
      ]),
    );
    expect(md).toContain('**[requests]');
  });

  it('italicizes dev dependencies', () => {
    const md = generateMarkdown(
      makeReport([
        makeChange({
          name: 'pytest',
          old_version: '8.0.0',
          new_version: '8.1.0',
          is_direct: true,
          is_dev: true,
        }),
      ]),
    );
    expect(md).toContain('*[pytest]');
    expect(md).not.toContain('**[pytest]');
  });

  it('leaves transitive deps as plain links', () => {
    const md = generateMarkdown(makeReport([makeChange({ name: 'urllib3' })]));
    expect(md).toContain('[urllib3]');
    expect(md).not.toContain('**[urllib3]');
    expect(md).not.toContain('*[urllib3]');
  });

  it('links python packages to PyPI', () => {
    const md = generateMarkdown(
      makeReport(
        [makeChange({ name: 'requests', old_version: '2.31.0', new_version: '2.32.3' })],
        'python',
      ),
    );
    expect(md).toContain('[requests](https://pypi.org/project/requests/)');
  });

  it('links javascript packages to npmjs', () => {
    const md = generateMarkdown(
      makeReport(
        [makeChange({ name: 'express', old_version: '4.18.2', new_version: '4.19.2' })],
        'javascript',
      ),
    );
    expect(md).toContain('[express](https://www.npmjs.com/package/express)');
  });

  it('links scoped npm packages correctly', () => {
    const md = generateMarkdown(
      makeReport(
        [makeChange({ name: '@babel/core', old_version: '7.23.9', new_version: '7.24.5' })],
        'javascript',
      ),
    );
    expect(md).toContain('[@babel/core](https://www.npmjs.com/package/%40babel%2Fcore)');
  });

  it('links deno jsr packages to jsr.io', () => {
    const md = generateMarkdown(
      makeReport(
        [makeChange({ name: 'jsr:@std/path', old_version: '0.224.0', new_version: '0.225.2' })],
        'deno',
      ),
    );
    expect(md).toContain('[jsr:@std/path](https://jsr.io/@std/path)');
  });

  it('includes all three sections when all change types are present', () => {
    const md = generateMarkdown(
      makeReport([
        makeChange({ name: 'added-pkg', change_type: 'added', old_version: null }),
        makeChange({ name: 'updated-pkg' }),
        makeChange({ name: 'removed-pkg', change_type: 'removed', new_version: null }),
      ]),
    );
    expect(md).toContain('### Added');
    expect(md).toContain('### Changed');
    expect(md).toContain('### Removed');
  });

  it('omits sections that have no changes', () => {
    const md = generateMarkdown(
      makeReport([
        makeChange({
          name: 'httpx',
          change_type: 'added',
          old_version: null,
          new_version: '0.27.0',
        }),
      ]),
    );
    expect(md).not.toContain('### Changed');
    expect(md).not.toContain('### Removed');
  });

  it('uses registry-map URL template for matching package prefix', () => {
    const registryMap: RegistryMap = {
      '@myorg/': 'https://github.com/orgs/MyOrg/packages?q={package}&visibility=all',
    };
    const md = generateMarkdown(
      makeReport([makeChange({ name: '@myorg/my-pkg' })], 'javascript'),
      registryMap,
    );
    expect(md).toContain(
      '[@myorg/my-pkg](https://github.com/orgs/MyOrg/packages?q=my-pkg&visibility=all)',
    );
    expect(md).not.toContain('npmjs.com');
  });

  it('substitutes {name}, {package}, and {scope} placeholders in registry-map templates', () => {
    const registryMap: RegistryMap = {
      '@acme/': 'https://registry.example.com/{scope}/{package}?full={name}',
    };
    const md = generateMarkdown(
      makeReport(
        [
          makeChange({
            name: '@acme/utils',
            change_type: 'added',
            old_version: null,
            new_version: '1.0.0',
          }),
        ],
        'javascript',
      ),
      registryMap,
    );
    expect(md).toContain('[@acme/utils](https://registry.example.com/acme/utils?full=@acme/utils)');
  });

  it('falls back to npmjs for packages not matching any registry-map prefix', () => {
    const registryMap: RegistryMap = {
      '@myorg/': 'https://github.com/orgs/MyOrg/packages?q={package}&visibility=all',
    };
    const md = generateMarkdown(
      makeReport(
        [makeChange({ name: 'express', old_version: '4.18.0', new_version: '4.19.0' })],
        'javascript',
      ),
      registryMap,
    );
    expect(md).toContain('[express](https://www.npmjs.com/package/express)');
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
            makeChange({
              name: 'httpx',
              change_type: 'added',
              old_version: null,
              new_version: '0.27.0',
            }),
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
            makeChange({
              name: 'axios',
              change_type: 'added',
              old_version: null,
              new_version: '1.7.0',
            }),
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
