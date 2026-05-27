# lockdelta

Diff dependency lockfiles between git refs or PRs and emit a structured report. Works as a **GitHub Action**, **CLI**, or **Node.js library**.

Supports Python, JavaScript, and Deno ecosystems — including automatic detection of tool migrations (e.g. poetry → uv). Monorepo-aware: all lockfiles in the repository are auto-discovered.

---

## GitHub Action

### Basic usage

```yaml
name: Dependency review
on:
  pull_request:
  push:
    branches: [main]

jobs:
  lockdelta:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read

    steps:
      - name: Diff dependencies
        id: lockdelta
        uses: lachaib/lockdelta@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Use the diff
        run: echo '${{ steps.lockdelta.outputs.diff }}'
```

No inputs are required on `pull_request` or `push` events. The action reads the relevant SHAs from the GitHub event payload automatically and fetches everything through the GitHub API — no `actions/checkout` needed.

| Event | What is compared |
|-------|-----------------|
| `pull_request` | PR base commit → head commit |
| `push` | SHA before the push → SHA after the push |

`GITHUB_TOKEN` is provided automatically by GitHub Actions — no extra secrets needed.

> **First push to a branch**: when `before` is the null SHA (no previous commit on the branch), the action skips rather than erroring.

### Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `pr-number` | GitHub PR number. Auto-detected from the event payload on `pull_request` events — usually not needed. | Auto |
| `base-ref` | Base git ref (branch, tag, SHA). Reads `GITHUB_BASE_REF` in CI. | `HEAD~1` |
| `head-ref` | Head git ref. Reads `GITHUB_HEAD_REF` in CI. | `HEAD` |
| `repo` | GitHub repo in `OWNER/NAME` format. Auto-detected from `GITHUB_REPOSITORY`. | Auto |
| `lockfile` | Specific lockfile path. Auto-discovers all if omitted. | — |
| `type` | Force lockfile type: `uv`, `poetry`, `pdm`, etc. Used with `lockfile`. | — |
| `filters` | YAML map of named package groups → boolean outputs (see [Filters](#filters)). | — |
| `markdown` | Set to `'true'` to generate a markdown summary output. | `false` |
| `json-to-file` | File path to write the JSON report to. | — |
| `markdown-to-file` | File path to write the markdown summary to. Requires `markdown: 'true'`. | — |
| `post-comment` | `'true'` always posts/updates a comment. `'if-changed'` posts only when at least one dependency changed. `'false'` never posts. Requires `pull-requests: write`. | `false` |

### Outputs

| Output | Description |
|--------|-------------|
| `diff` | Full JSON diff report (see [Output schema](#output-schema)) |
| `markdown` | Markdown summary (Added / Changed / Removed). Set when `markdown: 'true'`. |
| `<group>` | One boolean output per group defined in `filters`. |

### Markdown summary

When `markdown: 'true'` or `post-comment` is not `'false'`, lockdelta generates a three-section markdown summary. Direct production dependencies are **bold**, dev dependencies are *italic*, and transitive deps are plain. Package names link to their registry (PyPI, npmjs, jsr.io).

```yaml
- name: Diff dependencies
  id: lockdelta
  uses: lachaib/lockdelta@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    markdown: 'true'
    post-comment: 'if-changed'
```

(`pull-requests: write` permission required on the job for `post-comment`.)

Example output:

```markdown
### Changed

- **[requests](https://pypi.org/project/requests/)**: `2.31.0` → `2.32.3`
- *[pytest](https://pypi.org/project/pytest/)*: `8.0.0` → `8.1.0`
- [certifi](https://pypi.org/project/certifi/): `2024.2.2` → `2024.7.4`

### Added

- **[httpx](https://pypi.org/project/httpx/)**: `0.27.0`
```

### Filters

Inspired by [dorny/paths-filter](https://github.com/dorny/paths-filter), the `filters` input lets you name groups of packages. Each group produces a boolean output you can use to gate subsequent steps.

```yaml
- name: Diff dependencies
  id: lockdelta
  uses: lachaib/lockdelta@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    filters: |
      auth:
        - pyjwt
        - cryptography
        - authlib
      http-client:
        - httpx
        - requests
        - urllib3

- name: Run auth tests
  if: steps.lockdelta.outputs.auth == 'true'
  run: pytest tests/auth/

- name: Run integration tests
  if: steps.lockdelta.outputs.http-client == 'true'
  run: pytest tests/integration/
```

### Full example: review gate with PR comment

```yaml
name: Dependency review
on:
  pull_request:

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Diff dependencies
        id: lockdelta
        uses: lachaib/lockdelta@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          markdown: 'true'
          post-comment: 'if-changed'
          filters: |
            security:
              - pyjwt
              - cryptography
              - certifi

      - name: Block on security package changes
        if: steps.lockdelta.outputs.security == 'true'
        run: |
          echo "Security-sensitive packages changed — manual review required."
          exit 1
```

---

## CLI

```bash
npx lockdelta [options]
```

> **Note:** `GITHUB_TOKEN` must be set in the environment when using `--pr`.

### Options

```
--base <ref>         Base git ref (default: HEAD~1, or GITHUB_BASE_REF)
--head <ref>         Head git ref (default: HEAD, or GITHUB_HEAD_REF)
--pr <number>        GitHub PR number (uses GitHub API for exact SHAs)
--repo <owner/name>  GitHub repository (auto-detected from GITHUB_REPOSITORY or git remote)
--lockfile <path>    Compare a specific lockfile only
--type <type>        Force lockfile type: uv, poetry, pdm, npm, yarn, pnpm, bun, deno
--old <path>         Old lockfile path (local file comparison mode)
--new <path>         New lockfile path (local file comparison mode)
--output <path>      Write JSON to file instead of stdout
```

### Examples

```bash
# Compare against previous commit (git repo)
lockdelta

# Compare two specific refs
lockdelta --base main --head my-feature-branch

# Compare a GitHub PR by number
GITHUB_TOKEN=ghp_... lockdelta --pr 123 --repo owner/myrepo

# Compare two local lockfiles directly
lockdelta --old old/uv.lock --new new/uv.lock

# Filter to direct dependencies only
lockdelta --pr 123 | jq '.lockfiles[].changes[] | select(.is_direct)'
```

---

## Library

```ts
import { run } from 'lockdelta';

// Compare a PR (requires GITHUB_TOKEN in environment)
const report = await run({ prNumber: '123', repo: 'owner/myrepo' });

// Compare git refs
const report = await run({ base: 'main', head: 'my-branch' });

// Compare local files
const report = await run({ oldFile: './old.lock', newFile: './new.lock' });

console.log(report.summary);
// { added: 1, removed: 0, updated: 3, total_changes: 4, ecosystems: ['python'] }
```

### Extending with custom ecosystems

```ts
import { registerEcosystem } from 'lockdelta';
import type { Ecosystem, DirectDeps } from 'lockdelta';

const rubyEcosystem: Ecosystem = {
  name: 'ruby',
  supportedLockfiles: [{ filename: 'Gemfile.lock', type: 'bundler' }],
  manifestName: 'Gemfile',
  getLockfileType: (filename) => filename === 'Gemfile.lock' ? 'bundler' : undefined,
  parseLockfile: (content, _type) => { /* parse and return { name: version } */ return {}; },
  parseDirectDeps: (content): DirectDeps => ({ prod: new Set(), dev: new Set() }),
  normalizeName: (name) => name.toLowerCase(),
};

registerEcosystem(rubyEcosystem);
```

---

## Output schema

```ts
interface PackageChange {
  name: string;
  change_type: 'added' | 'removed' | 'updated';
  old_version: string | null;
  new_version: string | null;
  is_direct: boolean;  // declared in the project manifest
  is_dev: boolean;     // declared in a dev/optional dependency section
}

interface DiffReport {
  schema_version: '1';
  generated_at: string;         // ISO 8601
  base_ref: string;
  head_ref: string;
  summary: {
    added: number;
    removed: number;
    updated: number;
    total_changes: number;
    ecosystems: string[];        // e.g. ['python', 'javascript']
  };
  lockfiles: Array<{
    path: string | null;
    workspace: string;           // '.' for root, 'packages/backend' for monorepos
    type: string | null;         // e.g. 'uv' | 'poetry' | 'npm' | 'yarn'
    ecosystem: string;           // e.g. 'python' | 'javascript' | 'deno'
    summary: { added: number; removed: number; updated: number; total_changes: number };
    changes: PackageChange[];
    migration: {                 // non-null when the lockfile tool changed between refs
      note: string;
      base_lockfile: string | null;
      base_lockfile_type: string | null;
      head_lockfile: string | null;
      head_lockfile_type: string | null;
    } | null;
  }>;
}
```

---

## Supported ecosystems

### Python

| Lockfile | Tool | Notes |
|----------|------|-------|
| `uv.lock` | [uv](https://github.com/astral-sh/uv) | |
| `poetry.lock` | [Poetry](https://python-poetry.org) | |
| `pdm.lock` | [PDM](https://pdm-project.org) | |
| `pylock.toml` | pip / any ([PEP 751](https://peps.python.org/pep-0751/)) | standard format |

Manifest: `pyproject.toml`. Direct deps are read from `[project].dependencies` (prod) and `[project.optional-dependencies]`, `[tool.poetry.group.*]`, `[tool.uv.dev-dependencies]`, `[dependency-groups]` (dev).

### JavaScript

| Lockfile | Tool | Notes |
|----------|------|-------|
| `package-lock.json` | [npm](https://www.npmjs.com) | v1, v2, v3 |
| `yarn.lock` | [Yarn](https://yarnpkg.com) | Classic (v1) and Berry (v2+) |
| `pnpm-lock.yaml` | [pnpm](https://pnpm.io) | v5, v6, v9 |
| `bun.lock` | [Bun](https://bun.sh) | v1.2+ |

Manifest: `package.json`. `dependencies`, `optionalDependencies`, `peerDependencies` → prod. `devDependencies` → dev.

### Deno

| Lockfile | Tool |
|----------|------|
| `deno.lock` | [Deno](https://deno.land) |

Manifest: `deno.json`. Both npm and JSR packages are tracked (JSR packages are prefixed with `jsr:` to avoid name collisions).

Migrations between lockfile formats within the same ecosystem are detected automatically (e.g. poetry → uv).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, how to add a new ecosystem, and contribution guidelines.

---

## License

Apache 2.0 — Copyright 2026 Louis-Amaury Chaib. See [LICENSE](LICENSE).
