#!/usr/bin/env node

// src/cli.ts
import { writeFileSync } from "fs";
import { Command } from "commander";

// src/index.ts
import { readFileSync } from "fs";

// src/core/report.ts
import { posix as posix2 } from "path";

// src/ecosystems/python/parsers/toml.ts
import { parse } from "smol-toml";
function parseTomlPackages(content) {
  try {
    const data = parse(content);
    const packages = {};
    for (const pkg of [...data.package ?? [], ...data.packages ?? []]) {
      if (typeof pkg.name === "string" && typeof pkg.version === "string") {
        packages[pkg.name] = pkg.version;
      }
    }
    return packages;
  } catch {
    return parseTomlPackagesRegex(content);
  }
}
function parseTomlPackagesRegex(content) {
  const packages = {};
  const blocks = content.split(/\[\[packages?\]\]/);
  for (const block of blocks) {
    const nameMatch = block.match(/\nname\s*=\s*"([^"]+)"/);
    const versionMatch = block.match(/\nversion\s*=\s*"([^"]+)"/);
    if (nameMatch && versionMatch) {
      packages[nameMatch[1]] = versionMatch[1];
    }
  }
  return packages;
}

// src/ecosystems/python/pyproject.ts
import { parse as parse2 } from "smol-toml";
function normalizePythonName(name) {
  return name.toLowerCase().replace(/[-_.]+/g, "_");
}
function extractPkgName(dep) {
  const match = String(dep).match(/^([\w][\w.-]*)/);
  return match ? normalizePythonName(match[1]) : null;
}
function parseDirectDeps(content) {
  const prod = /* @__PURE__ */ new Set();
  const dev = /* @__PURE__ */ new Set();
  let data;
  try {
    data = parse2(content);
  } catch {
    return { prod, dev };
  }
  const project = data["project"];
  const pep517Deps = project?.["dependencies"];
  if (Array.isArray(pep517Deps)) {
    for (const dep of pep517Deps) {
      const name = extractPkgName(dep);
      if (name) prod.add(name);
    }
  }
  const optDeps = project?.["optional-dependencies"];
  if (optDeps && typeof optDeps === "object") {
    for (const group of Object.values(optDeps)) {
      if (Array.isArray(group)) {
        for (const dep of group) {
          const name = extractPkgName(dep);
          if (name && !prod.has(name)) dev.add(name);
        }
      }
    }
  }
  const tool = data["tool"];
  const poetry = tool?.["poetry"];
  if (poetry) {
    const poetryDeps = poetry["dependencies"];
    if (poetryDeps) {
      for (const key of Object.keys(poetryDeps)) {
        if (key.toLowerCase() !== "python") prod.add(normalizePythonName(key));
      }
    }
    const devDeps = poetry["dev-dependencies"];
    if (devDeps) {
      for (const key of Object.keys(devDeps)) {
        const normalized = normalizePythonName(key);
        if (!prod.has(normalized)) dev.add(normalized);
      }
    }
    const groups = poetry["group"];
    if (groups) {
      for (const group of Object.values(groups)) {
        const groupDeps = group["dependencies"];
        if (groupDeps) {
          for (const key of Object.keys(groupDeps)) {
            const normalized = normalizePythonName(key);
            if (!prod.has(normalized)) dev.add(normalized);
          }
        }
      }
    }
  }
  const uv = tool?.["uv"];
  const uvDevDeps = uv?.["dev-dependencies"];
  if (Array.isArray(uvDevDeps)) {
    for (const dep of uvDevDeps) {
      const name = extractPkgName(dep);
      if (name && !prod.has(name)) dev.add(name);
    }
  }
  const depGroups = data["dependency-groups"];
  if (depGroups && typeof depGroups === "object") {
    for (const group of Object.values(depGroups)) {
      if (Array.isArray(group)) {
        for (const entry of group) {
          if (typeof entry === "string") {
            const name = extractPkgName(entry);
            if (name && !prod.has(name)) dev.add(name);
          }
        }
      }
    }
  }
  return { prod, dev };
}

// src/ecosystems/python/index.ts
var SUPPORTED_LOCKFILES = [
  { filename: "uv.lock", type: "uv" },
  { filename: "poetry.lock", type: "poetry" },
  { filename: "pdm.lock", type: "pdm" },
  { filename: "pylock.toml", type: "pylock" }
  // PEP 751
];
var lockfileTypeMap = new Map(SUPPORTED_LOCKFILES.map((l) => [l.filename, l.type]));
var pythonEcosystem = {
  name: "python",
  supportedLockfiles: SUPPORTED_LOCKFILES,
  manifestName: "pyproject.toml",
  getLockfileType(filename) {
    return lockfileTypeMap.get(filename);
  },
  parseLockfile(content, _lockfileType) {
    return parseTomlPackages(content);
  },
  parseDirectDeps(manifestContent) {
    return parseDirectDeps(manifestContent);
  },
  normalizeName(name) {
    return normalizePythonName(name);
  }
};

// src/ecosystems/javascript/parsers/npm.ts
function parseNpmLock(content) {
  const data = JSON.parse(content);
  const version = data.lockfileVersion ?? 1;
  if (version >= 2 && data.packages) {
    return parseV2Packages(data.packages);
  }
  if (data.dependencies) {
    return parseV1Dependencies(data.dependencies);
  }
  return {};
}
function parseV2Packages(packages) {
  const result = {};
  for (const [key, pkg] of Object.entries(packages)) {
    if (!key) continue;
    if (!key.startsWith("node_modules/")) continue;
    const segments = key.split("node_modules/");
    if (segments.length > 2) continue;
    const name = key.slice("node_modules/".length);
    const pkgVersion = pkg.version;
    if (pkgVersion && !result[name]) {
      result[name] = pkgVersion;
    }
  }
  return result;
}
function parseV1Dependencies(deps, result = {}) {
  for (const [name, pkg] of Object.entries(deps)) {
    if (pkg.version && !result[name]) {
      result[name] = pkg.version;
    }
    if (pkg.dependencies) {
      parseV1Dependencies(pkg.dependencies, result);
    }
  }
  return result;
}

// src/ecosystems/javascript/parsers/yarn.ts
import { parse as parseYaml } from "yaml";
function parseYarnLock(content) {
  return isYarnBerry(content) ? parseYarnBerry(content) : parseYarnV1(content);
}
function isYarnBerry(content) {
  return content.includes("__metadata:");
}
function extractNameFromSpecifier(spec) {
  const trimmed = spec.trim().replace(/^"|"$/g, "");
  if (trimmed.startsWith("@")) {
    const idx = trimmed.indexOf("@", 1);
    return idx > 0 ? trimmed.slice(0, idx) : trimmed;
  }
  const atIdx = trimmed.indexOf("@");
  return atIdx > 0 ? trimmed.slice(0, atIdx) : trimmed;
}
function parseYarnV1(content) {
  const packages = {};
  const blocks = content.split(/\n\n+/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const versionMatch = trimmed.match(/^[ \t]+version "([^"]+)"/m);
    if (!versionMatch) continue;
    const headerLine = trimmed.split("\n")[0].trim().replace(/:$/, "");
    const firstSpecifier = headerLine.split(",")[0].trim().replace(/^"|"$/g, "");
    const name = extractNameFromSpecifier(firstSpecifier);
    if (name && !packages[name]) {
      packages[name] = versionMatch[1];
    }
  }
  return packages;
}
function parseYarnBerry(content) {
  const data = parseYaml(content);
  const packages = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "__metadata") continue;
    if (typeof value !== "object" || !value) continue;
    const entry = value;
    if (entry.linkType === "soft") continue;
    if (!entry.version) continue;
    const cleanKey = key.replace(/^"|"$/g, "");
    const name = extractNameFromBerryKey(cleanKey);
    if (name && !packages[name]) {
      packages[name] = entry.version;
    }
  }
  return packages;
}
function extractNameFromBerryKey(key) {
  if (key.startsWith("@")) {
    const idx = key.indexOf("@", 1);
    return idx > 0 ? key.slice(0, idx) : key;
  }
  return key.split("@")[0];
}

// src/ecosystems/javascript/parsers/pnpm.ts
import { parse as parseYaml2 } from "yaml";
function parsePnpmLock(content) {
  const data = parseYaml2(content);
  if (!data?.packages) return {};
  const lockfileVersion = parseLockfileVersion(data.lockfileVersion);
  if (lockfileVersion >= 9) {
    return parsePnpmV9(data.packages);
  }
  return parsePnpmLegacy(data.packages);
}
function parseLockfileVersion(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v);
  return 0;
}
function parsePnpmV9(packages) {
  const result = {};
  for (const key of Object.keys(packages)) {
    let name, version;
    if (key.startsWith("@")) {
      const atIdx = key.indexOf("@", 1);
      if (atIdx < 0) continue;
      name = key.slice(0, atIdx);
      version = key.slice(atIdx + 1);
    } else {
      const atIdx = key.indexOf("@");
      if (atIdx < 0) continue;
      name = key.slice(0, atIdx);
      version = key.slice(atIdx + 1);
    }
    version = stripVersionSuffix(version);
    if (name && version && !result[name]) {
      result[name] = version;
    }
  }
  return result;
}
function parsePnpmLegacy(packages) {
  const result = {};
  for (const key of Object.keys(packages)) {
    const cleaned = key.startsWith("/") ? key.slice(1) : key;
    let name, version;
    if (cleaned.startsWith("@")) {
      const secondSlash = cleaned.indexOf("/", cleaned.indexOf("/") + 1);
      const secondAt = cleaned.indexOf("@", 1);
      if (secondAt > 0 && (secondSlash < 0 || secondAt < secondSlash)) {
        name = cleaned.slice(0, secondAt);
        version = cleaned.slice(secondAt + 1);
      } else if (secondSlash > 0) {
        name = cleaned.slice(0, secondSlash);
        version = cleaned.slice(secondSlash + 1);
      } else {
        continue;
      }
    } else {
      const atIdx = cleaned.indexOf("@");
      const slashIdx = cleaned.indexOf("/");
      if (atIdx > 0 && (slashIdx < 0 || atIdx < slashIdx)) {
        name = cleaned.slice(0, atIdx);
        version = cleaned.slice(atIdx + 1);
      } else if (slashIdx > 0) {
        name = cleaned.slice(0, slashIdx);
        version = cleaned.slice(slashIdx + 1);
      } else {
        continue;
      }
    }
    version = stripVersionSuffix(version);
    if (name && version && !result[name]) {
      result[name] = version;
    }
  }
  return result;
}
function stripVersionSuffix(version) {
  return version.split("(")[0].split("_")[0].trim();
}

// src/ecosystems/javascript/parsers/bun.ts
function parseBunLock(content) {
  const data = JSON.parse(content);
  const result = {};
  for (const [name, entry] of Object.entries(data.packages ?? {})) {
    if (!Array.isArray(entry)) continue;
    const nameAtVersion = entry[0];
    if (typeof nameAtVersion !== "string") continue;
    const version = extractVersion(nameAtVersion);
    if (!version || version.startsWith("workspace:")) continue;
    result[name] = version;
  }
  return result;
}
function extractVersion(nameAtVersion) {
  if (nameAtVersion.startsWith("@")) {
    const atIdx2 = nameAtVersion.indexOf("@", 1);
    return atIdx2 > 0 ? nameAtVersion.slice(atIdx2 + 1) : "";
  }
  const atIdx = nameAtVersion.indexOf("@");
  return atIdx > 0 ? nameAtVersion.slice(atIdx + 1) : "";
}

// src/ecosystems/javascript/package-json.ts
var PROD_SECTIONS = ["dependencies", "optionalDependencies", "peerDependencies"];
function normalizeJsName(name) {
  return name.toLowerCase();
}
function parseDirectDeps2(content) {
  const prod = /* @__PURE__ */ new Set();
  const dev = /* @__PURE__ */ new Set();
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    return { prod, dev };
  }
  for (const section of PROD_SECTIONS) {
    const deps = data[section];
    if (deps && typeof deps === "object") {
      for (const name of Object.keys(deps)) {
        prod.add(normalizeJsName(name));
      }
    }
  }
  const devDeps = data["devDependencies"];
  if (devDeps && typeof devDeps === "object") {
    for (const name of Object.keys(devDeps)) {
      const normalized = normalizeJsName(name);
      if (!prod.has(normalized)) dev.add(normalized);
    }
  }
  return { prod, dev };
}

// src/ecosystems/javascript/index.ts
var SUPPORTED_LOCKFILES2 = [
  { filename: "package-lock.json", type: "npm" },
  { filename: "yarn.lock", type: "yarn" },
  { filename: "pnpm-lock.yaml", type: "pnpm" },
  { filename: "bun.lock", type: "bun" }
];
var lockfileTypeMap2 = new Map(SUPPORTED_LOCKFILES2.map((l) => [l.filename, l.type]));
var javascriptEcosystem = {
  name: "javascript",
  supportedLockfiles: SUPPORTED_LOCKFILES2,
  manifestName: "package.json",
  getLockfileType(filename) {
    return lockfileTypeMap2.get(filename);
  },
  parseLockfile(content, lockfileType) {
    switch (lockfileType) {
      case "npm":
        return parseNpmLock(content);
      case "yarn":
        return parseYarnLock(content);
      case "pnpm":
        return parsePnpmLock(content);
      case "bun":
        return parseBunLock(content);
      default:
        return {};
    }
  },
  parseDirectDeps(manifestContent) {
    return parseDirectDeps2(manifestContent);
  },
  normalizeName(name) {
    return normalizeJsName(name);
  }
};

// src/ecosystems/deno/parsers/deno-lock.ts
function parseDenoLock(content) {
  const data = JSON.parse(content);
  const result = {};
  for (const [key, registry2] of [
    ["npm", data.packages?.npm],
    ["jsr", data.packages?.jsr]
  ]) {
    if (!registry2) continue;
    for (const specifier of Object.keys(registry2)) {
      const { name, version } = splitSpecifier(specifier);
      const resultKey = key === "jsr" ? `jsr:${name}` : name;
      if (name && version && !result[resultKey]) {
        result[resultKey] = version;
      }
    }
  }
  return result;
}
function splitSpecifier(specifier) {
  if (specifier.startsWith("@")) {
    const atIdx2 = specifier.indexOf("@", 1);
    if (atIdx2 < 0) return { name: specifier, version: "" };
    return { name: specifier.slice(0, atIdx2), version: specifier.slice(atIdx2 + 1) };
  }
  const atIdx = specifier.indexOf("@");
  if (atIdx < 0) return { name: specifier, version: "" };
  return { name: specifier.slice(0, atIdx), version: specifier.slice(atIdx + 1) };
}

// src/ecosystems/deno/deno-json.ts
function normalizeDenoName(name) {
  return name.toLowerCase();
}
function parseDirectDeps3(content) {
  const prod = /* @__PURE__ */ new Set();
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    return { prod, dev: /* @__PURE__ */ new Set() };
  }
  const imports = data["imports"];
  if (imports) {
    for (const specifier of Object.values(imports)) {
      const name = extractPackageName(specifier);
      if (name) prod.add(normalizeDenoName(name));
    }
  }
  const workspace = data["workspace"];
  for (const specifier of workspace?.dependencies ?? []) {
    const name = extractPackageName(specifier);
    if (name) prod.add(normalizeDenoName(name));
  }
  return { prod, dev: /* @__PURE__ */ new Set() };
}
function extractPackageName(specifier) {
  const withoutProtocol = specifier.replace(/^(?:npm|jsr|node):/, "");
  if (specifier.startsWith("node:")) return null;
  if (withoutProtocol.startsWith("@")) {
    const atIdx2 = withoutProtocol.indexOf("@", 1);
    return atIdx2 > 0 ? withoutProtocol.slice(0, atIdx2) : withoutProtocol;
  }
  const atIdx = withoutProtocol.indexOf("@");
  return atIdx > 0 ? withoutProtocol.slice(0, atIdx) : withoutProtocol || null;
}

// src/ecosystems/deno/index.ts
var SUPPORTED_LOCKFILES3 = [{ filename: "deno.lock", type: "deno" }];
var denoEcosystem = {
  name: "deno",
  supportedLockfiles: SUPPORTED_LOCKFILES3,
  manifestName: "deno.json",
  getLockfileType(filename) {
    return filename === "deno.lock" ? "deno" : void 0;
  },
  parseLockfile(content, _lockfileType) {
    return parseDenoLock(content);
  },
  parseDirectDeps(manifestContent) {
    return parseDirectDeps3(manifestContent);
  },
  normalizeName(name) {
    return normalizeDenoName(name);
  }
};

// src/ecosystems/index.ts
var registry = /* @__PURE__ */ new Map();
function registerEcosystem(ecosystem) {
  registry.set(ecosystem.name, ecosystem);
}
function getEcosystemByName(name) {
  return registry.get(name);
}
function getEcosystemForLockfile(filename) {
  for (const ecosystem of registry.values()) {
    if (ecosystem.getLockfileType(filename) !== void 0) return ecosystem;
  }
  return void 0;
}
function getAllEcosystems() {
  return [...registry.values()];
}
registerEcosystem(pythonEcosystem);
registerEcosystem(javascriptEcosystem);
registerEcosystem(denoEcosystem);

// src/core/discovery.ts
import { posix } from "path";
function workspaceFromPath(filePath) {
  const parent = posix.dirname(filePath);
  return parent === "." || parent === "" ? "." : parent;
}
function detectLockfileInfo(filePath) {
  const filename = posix.basename(filePath);
  const ecosystem = getEcosystemForLockfile(filename);
  if (!ecosystem) return null;
  const type = ecosystem.getLockfileType(filename);
  if (!type) return null;
  return { path: filePath, type, ecosystemName: ecosystem.name };
}
function findAllLockfiles(paths) {
  return paths.flatMap((p) => {
    const info = detectLockfileInfo(p);
    return info ? [info] : [];
  });
}
async function findLockfiles(getFile) {
  const candidates = getAllEcosystems().flatMap(
    (ecosystem) => ecosystem.supportedLockfiles.map(({ filename, type }) => ({
      filename,
      type,
      ecosystemName: ecosystem.name
    }))
  );
  const results = await Promise.all(
    candidates.map(async ({ filename, type, ecosystemName }) => {
      const content = await getFile(filename);
      return content !== null ? { path: filename, type, ecosystemName } : null;
    })
  );
  return results.filter((r) => r !== null);
}
function groupByWorkspace(lockfiles) {
  const result = /* @__PURE__ */ new Map();
  for (const lf of lockfiles) {
    const ws = workspaceFromPath(lf.path);
    const existing = result.get(ws) ?? [];
    existing.push(lf);
    result.set(ws, existing);
  }
  return result;
}
var LOCKFILE_PRIORITY = {
  "uv.lock": 0,
  "poetry.lock": 1,
  "pdm.lock": 2
};
function lockfilePriority(path) {
  return LOCKFILE_PRIORITY[posix.basename(path)] ?? 99;
}
function resolveLockfilePair(baseFiles, headFiles) {
  const headByPath = new Map(headFiles.map((f) => [f.path, f]));
  const common = baseFiles.filter((f) => headByPath.has(f.path));
  if (common.length > 0) {
    const chosen = common.sort((a, b) => lockfilePriority(a.path) - lockfilePriority(b.path))[0];
    return {
      basePath: chosen.path,
      baseType: chosen.type,
      headPath: chosen.path,
      headType: headByPath.get(chosen.path).type,
      migrationNote: null,
      ecosystemName: chosen.ecosystemName
    };
  }
  if (baseFiles.length > 0 && headFiles.length > 0) {
    const base = baseFiles[0];
    const head = headFiles[0];
    return {
      basePath: base.path,
      baseType: base.type,
      headPath: head.path,
      headType: head.type,
      migrationNote: `lockfile migration: ${posix.basename(base.path)} (${base.type}) \u2192 ${posix.basename(head.path)} (${head.type})`,
      ecosystemName: head.ecosystemName
    };
  }
  if (headFiles.length > 0) {
    const head = headFiles[0];
    return {
      basePath: null,
      baseType: null,
      headPath: head.path,
      headType: head.type,
      migrationNote: `new lockfile added: ${posix.basename(head.path)} (${head.type})`,
      ecosystemName: head.ecosystemName
    };
  }
  if (baseFiles.length > 0) {
    const base = baseFiles[0];
    return {
      basePath: base.path,
      baseType: base.type,
      headPath: null,
      headType: null,
      migrationNote: `lockfile removed: ${posix.basename(base.path)} (${base.type})`,
      ecosystemName: base.ecosystemName
    };
  }
  return null;
}

// src/core/diff.ts
function diffPackages(oldPkgs, newPkgs, directDeps, normalizeName) {
  const allNames = /* @__PURE__ */ new Set([...Object.keys(oldPkgs), ...Object.keys(newPkgs)]);
  const changes = [];
  for (const name of [...allNames].sort()) {
    const inOld = name in oldPkgs;
    const inNew = name in newPkgs;
    if (inOld && inNew && oldPkgs[name] === newPkgs[name]) continue;
    const normalized = normalizeName(name);
    const isProd = directDeps.prod.has(normalized);
    const isDev = directDeps.dev.has(normalized) && !isProd;
    changes.push({
      name,
      change_type: !inOld ? "added" : !inNew ? "removed" : "updated",
      old_version: inOld ? oldPkgs[name] : null,
      new_version: inNew ? newPkgs[name] : null,
      is_direct: isProd || isDev,
      is_dev: isDev
    });
  }
  return changes;
}

// src/core/report.ts
async function buildLockfileEntry(pair, workspace, getBase, getHead) {
  const ecosystem = getEcosystemByName(pair.ecosystemName);
  if (!ecosystem) return null;
  const manifestPath = ecosystem.manifestName ? workspace === "." ? ecosystem.manifestName : posix2.join(workspace, ecosystem.manifestName) : null;
  const [oldContent, newContent, manifestContent] = await Promise.all([
    pair.basePath ? getBase(pair.basePath) : Promise.resolve(null),
    pair.headPath ? getHead(pair.headPath) : Promise.resolve(null),
    manifestPath ? getHead(manifestPath) : Promise.resolve(null)
  ]);
  const oldPkgs = oldContent && pair.baseType ? ecosystem.parseLockfile(oldContent, pair.baseType) : {};
  const newPkgs = newContent && pair.headType ? ecosystem.parseLockfile(newContent, pair.headType) : {};
  const directDeps = manifestContent ? ecosystem.parseDirectDeps(manifestContent) : { prod: /* @__PURE__ */ new Set(), dev: /* @__PURE__ */ new Set() };
  const changes = diffPackages(
    oldPkgs,
    newPkgs,
    directDeps,
    ecosystem.normalizeName.bind(ecosystem)
  );
  const added = changes.filter((c) => c.change_type === "added").length;
  const removed = changes.filter((c) => c.change_type === "removed").length;
  const updated = changes.filter((c) => c.change_type === "updated").length;
  return {
    path: pair.headPath ?? pair.basePath,
    workspace,
    type: pair.headType ?? pair.baseType,
    ecosystem: pair.ecosystemName,
    summary: { added, removed, updated, total_changes: changes.length },
    changes,
    migration: pair.migrationNote ? {
      note: pair.migrationNote,
      base_lockfile: pair.basePath,
      base_lockfile_type: pair.baseType,
      head_lockfile: pair.headPath,
      head_lockfile_type: pair.headType
    } : null
  };
}
async function collectLockfileEntries(options) {
  const { getBase, getHead, allBasePaths, allHeadPaths, lockfile, lockfileType, onNote } = options;
  if (lockfile) {
    const filename = posix2.basename(lockfile);
    const ecosystem = getEcosystemForLockfile(filename);
    if (!ecosystem) throw new Error(`Cannot determine ecosystem for lockfile: ${lockfile}`);
    const type = lockfileType ?? ecosystem.getLockfileType(filename);
    if (!type) throw new Error(`Cannot determine lockfile type for ${lockfile} \u2014 use --type`);
    const ws = posix2.dirname(lockfile);
    const pair = {
      basePath: lockfile,
      baseType: type,
      headPath: lockfile,
      headType: type,
      migrationNote: null,
      ecosystemName: ecosystem.name
    };
    const entry = await buildLockfileEntry(
      pair,
      ws === "." || ws === "" ? "." : ws,
      getBase,
      getHead
    );
    return entry ? [entry] : [];
  }
  let baseAll = findAllLockfiles(allBasePaths);
  let headAll = findAllLockfiles(allHeadPaths);
  if (baseAll.length === 0 && headAll.length === 0) {
    [baseAll, headAll] = await Promise.all([findLockfiles(getBase), findLockfiles(getHead)]);
  }
  const baseByWs = groupByWorkspace(baseAll);
  const headByWs = groupByWorkspace(headAll);
  const allWorkspaces = [.../* @__PURE__ */ new Set([...baseByWs.keys(), ...headByWs.keys()])].sort();
  const entries = await Promise.all(
    allWorkspaces.map(async (ws) => {
      const baseFiles = baseByWs.get(ws) ?? [];
      const headFiles = headByWs.get(ws) ?? [];
      const pair = resolveLockfilePair(baseFiles, headFiles);
      if (!pair) return null;
      if (pair.migrationNote) onNote?.(`[${ws}]: ${pair.migrationNote}`);
      return buildLockfileEntry(pair, ws, getBase, getHead);
    })
  );
  return entries.filter((e) => e !== null);
}
function buildDiffReport(lockfiles, baseRef, headRef) {
  const totalAdded = lockfiles.reduce((sum, lf) => sum + lf.summary.added, 0);
  const totalRemoved = lockfiles.reduce((sum, lf) => sum + lf.summary.removed, 0);
  const totalUpdated = lockfiles.reduce((sum, lf) => sum + lf.summary.updated, 0);
  const ecosystems = [...new Set(lockfiles.map((lf) => lf.ecosystem))].sort();
  return {
    schema_version: "1",
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    base_ref: baseRef,
    head_ref: headRef,
    summary: {
      added: totalAdded,
      removed: totalRemoved,
      updated: totalUpdated,
      total_changes: totalAdded + totalRemoved + totalUpdated,
      ecosystems
    },
    lockfiles
  };
}

// src/sources/git.ts
import { execFileSync } from "child_process";
function gitShow(ref, path) {
  try {
    const result = execFileSync("git", ["show", `${ref}:${path}`], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return result || null;
  } catch {
    return null;
  }
}
function gitLsTree(ref) {
  try {
    const result = execFileSync("git", ["ls-tree", "-r", "--name-only", ref], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return result.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// src/sources/github.ts
import { execFileSync as execFileSync2 } from "child_process";
var API_BASE = "https://api.github.com";
function token() {
  const t = process.env["GITHUB_TOKEN"];
  if (!t) throw new Error("GITHUB_TOKEN is required for GitHub API access");
  return t;
}
function headers(accept = "application/vnd.github+json") {
  return {
    Authorization: `Bearer ${token()}`,
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28"
  };
}
async function ghFileAtSha(sha, path, repo) {
  const url = `${API_BASE}/repos/${repo}/contents/${path}?ref=${sha}`;
  const response = await fetch(url, {
    headers: headers("application/vnd.github.raw+json")
  });
  if (!response.ok) return null;
  return response.text();
}
async function ghLsTree(sha, repo) {
  const url = `${API_BASE}/repos/${repo}/git/trees/${sha}?recursive=1`;
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) return [];
  const data = await response.json();
  return data.tree.filter((item) => item.type === "blob").map((item) => item.path);
}
async function getPrShas(prNumber, repo) {
  const url = `${API_BASE}/repos/${repo}/pulls/${prNumber}`;
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}: failed to fetch PR #${prNumber}`);
  }
  const data = await response.json();
  return { baseRefOid: data.base.sha, headRefOid: data.head.sha };
}
function detectRepo() {
  const fromEnv = process.env["GITHUB_REPOSITORY"];
  if (fromEnv) return fromEnv;
  try {
    const remote = execFileSync2("git", ["remote", "get-url", "origin"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {
  }
  throw new Error(
    "Could not detect GitHub repo \u2014 set GITHUB_REPOSITORY or pass --repo"
  );
}

// src/index.ts
async function resolveApiShas(options) {
  if (options.baseSha && options.headSha) {
    return { baseSha: options.baseSha, headSha: options.headSha, repo: options.repo ?? detectRepo() };
  }
  if (options.prNumber) {
    const repo = options.repo ?? detectRepo();
    const { baseRefOid, headRefOid } = await getPrShas(options.prNumber, repo);
    return { baseSha: baseRefOid, headSha: headRefOid, repo };
  }
  return null;
}
async function run(options = {}) {
  const { lockfile, lockfileType, onNote } = options;
  if (options.oldFile && options.newFile) {
    const oldPath = options.oldFile;
    const newPath = options.newFile;
    const readLocal = (filePath) => {
      try {
        return readFileSync(filePath, "utf-8");
      } catch {
        return null;
      }
    };
    const getBase2 = (path) => Promise.resolve(path === oldPath ? readLocal(oldPath) : null);
    const getHead2 = (path) => Promise.resolve(path === newPath ? readLocal(newPath) : null);
    const lockfiles2 = await collectLockfileEntries({
      getBase: getBase2,
      getHead: getHead2,
      allBasePaths: [oldPath],
      allHeadPaths: [newPath],
      lockfile: newPath,
      lockfileType,
      onNote
    });
    if (lockfiles2.length === 0) throw new Error("No supported lockfiles found");
    return buildDiffReport(lockfiles2, "local_old", "local_new");
  }
  const apiShas = await resolveApiShas(options);
  if (apiShas) {
    const { baseSha, headSha, repo } = apiShas;
    const getBase2 = (path) => ghFileAtSha(baseSha, path, repo);
    const getHead2 = (path) => ghFileAtSha(headSha, path, repo);
    const [basePaths, headPaths] = await Promise.all([
      ghLsTree(baseSha, repo),
      ghLsTree(headSha, repo)
    ]);
    const lockfiles2 = await collectLockfileEntries({
      getBase: getBase2,
      getHead: getHead2,
      allBasePaths: basePaths,
      allHeadPaths: headPaths,
      lockfile,
      lockfileType,
      onNote
    });
    if (lockfiles2.length === 0) throw new Error("No supported lockfiles found");
    return buildDiffReport(lockfiles2, baseSha, headSha);
  }
  const baseRef = options.base ?? "HEAD~1";
  const headRef = options.head ?? "HEAD";
  const getBase = (path) => Promise.resolve(gitShow(baseRef, path));
  const getHead = (path) => Promise.resolve(gitShow(headRef, path));
  const lockfiles = await collectLockfileEntries({
    getBase,
    getHead,
    allBasePaths: gitLsTree(baseRef),
    allHeadPaths: gitLsTree(headRef),
    lockfile,
    lockfileType,
    onNote
  });
  if (lockfiles.length === 0) throw new Error("No supported lockfiles found");
  return buildDiffReport(lockfiles, baseRef, headRef);
}

// src/cli.ts
var program = new Command();
program.name("depdiff").description("Diff dependency lockfiles between git refs, PRs, or local files").version("0.1.0").option(
  "--base <ref>",
  'Base git ref (default: HEAD~1). In CI, reads GITHUB_BASE_REF \u2014 may need "origin/" prefix.',
  process.env["GITHUB_BASE_REF"]
).option(
  "--head <ref>",
  "Head git ref (default: HEAD). In CI, reads GITHUB_HEAD_REF.",
  process.env["GITHUB_HEAD_REF"]
).option(
  "--pr <number>",
  "GitHub PR number. Fetches exact SHAs via gh CLI.",
  process.env["GITHUB_PR_NUMBER"]
).option(
  "--repo <owner/name>",
  "GitHub repo in OWNER/NAME format. Auto-detected if omitted.",
  process.env["GITHUB_REPOSITORY"]
).option("--lockfile <path>", "Specific lockfile path. Auto-discovers all lockfiles if omitted.").option("--type <type>", "Force lockfile type: uv, poetry, pdm. Only used with --lockfile.").option("--old <path>", "Old lockfile path (local file comparison mode).").option("--new <path>", "New lockfile path (local file comparison mode).").option("--output <path>", "Write JSON report to file instead of stdout.").action(async (opts) => {
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
      onNote: (msg) => process.stderr.write(`Note: ${msg}
`)
    });
    const json = JSON.stringify(report, null, 2) + "\n";
    if (opts.output) {
      writeFileSync(opts.output, json, "utf-8");
      process.stderr.write(`Report written to ${opts.output}
`);
    } else {
      process.stdout.write(json);
    }
  } catch (err) {
    process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}
`);
    process.exit(1);
  }
});
program.parse();
//# sourceMappingURL=cli.js.map