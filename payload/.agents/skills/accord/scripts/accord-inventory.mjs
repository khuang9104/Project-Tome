#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadProjectModel } from './accord-project.mjs';

const HARD_EXCLUDES = new Set([
  '.git', '.accord', '.agents',
  'node_modules', 'vendor', 'dist', 'build', 'out', 'target', 'coverage',
  '.next', '.nuxt', '.cache', '.turbo', '.venv', 'venv', '__pycache__'
]);
const HARD_EXCLUDED_PATHS = ['.github/skills'];
const DEFAULT_LIMITS = {
  max_depth: 6,
  max_tree_entries: 400,
  max_category_entries: 80,
  max_files_visited: 20000,
  max_directories_visited: 3000,
  max_duration_ms: 10000
};
const MANIFEST_NAMES = new Set([
  'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
  'pyproject.toml', 'requirements.txt', 'poetry.lock', 'uv.lock',
  'go.mod', 'go.sum', 'Cargo.toml', 'Cargo.lock', 'pom.xml',
  'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts',
  'composer.json', 'Gemfile', 'mix.exs', 'pubspec.yaml', 'Package.swift',
  'CMakeLists.txt', 'Makefile', 'Dockerfile', 'docker-compose.yml',
  'docker-compose.yaml'
]);
const ENTRY_NAMES = new Set([
  'main.py', 'app.py', 'server.py', 'Program.cs', 'Main.java', 'main.go',
  'main.rs', 'main.swift', 'index.ts', 'index.js', 'index.mjs', 'app.ts',
  'app.js', 'server.ts', 'server.js'
]);
const SCHEMA_EXTENSIONS = new Set(['.graphql', '.gql', '.proto', '.avsc', '.xsd']);
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.java',
  '.kt', '.rb', '.php', '.rs', '.cs', '.cpp', '.c', '.h', '.swift',
  '.scala', '.ex', '.exs', '.sql'
]);

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function git(projectRoot, args) {
  const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8' });
  return result.status === 0 ? (result.stdout || '').trim() : null;
}

function ignoredProjectPaths(projectRoot, timeout) {
  const result = spawnSync(
    'git',
    ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout,
      maxBuffer: 4 * 1024 * 1024
    }
  );
  if (result.status !== 0) {
    return { exact: new Set(), directoryPrefixes: [], count: 0, limited: Boolean(result.error) };
  }
  const entries = (result.stdout || '').split('\0').filter(Boolean).map(normalize);
  return {
    exact: new Set(entries.map((entry) => entry.replace(/\/$/, ''))),
    directoryPrefixes: entries.filter((entry) => entry.endsWith('/'))
      .map((entry) => entry.replace(/\/$/, '')),
    count: entries.length,
    limited: false
  };
}

function loadConfig(projectRoot) {
  const configPath = path.join(projectRoot, '.accord', 'accord.yaml');
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
}

function managedDocumentationPaths(projectRoot, config) {
  // A shared docs/ folder is not owned wholesale by Project Tome. Without its manifest,
  // existing architecture and module documents remain discovery input.
  if (config.knowledge_base?.root !== 'docs') return new Set();
  try {
    const manifestPath = path.join(projectRoot, 'docs', 'manifest.yaml');
    if (fs.statSync(manifestPath).size > 1024 * 1024) return new Set();
    const relative = path.relative(fs.realpathSync(projectRoot), fs.realpathSync(manifestPath));
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return new Set();
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.schema_version === '2.0') {
      const model = loadProjectModel(projectRoot, config, manifest);
      return new Set([...model.metadata_paths, ...model.documents.map(d => d.path)]);
    }
    return new Set();
  } catch {
    return new Set();
  }
}

function isExcluded(relativePath, projectExcludes, managedDocuments) {
  const normalized = normalize(relativePath);
  const parts = normalized.split('/');
  if (parts.some((part) => HARD_EXCLUDES.has(part))) {
    return true;
  }
  if (HARD_EXCLUDED_PATHS.some(
    (excluded) => normalized === excluded || normalized.startsWith(excluded + '/')
  )) {
    return true;
  }
  if (managedDocuments.has(normalized)) {
    return true;
  }
  return projectExcludes.some(
    (excluded) => normalized === excluded || normalized.startsWith(excluded + '/')
  );
}

function boundedPush(target, value, limit, truncation, category) {
  if (target.length < limit) {
    target.push(value);
  } else {
    truncation[category] = (truncation[category] || 0) + 1;
  }
}

export function inventoryProject(projectInput) {
  const projectRoot = path.resolve(projectInput);
  const startedAt = Date.now();
  const config = loadConfig(projectRoot);
  const managedDocuments = managedDocumentationPaths(projectRoot, config);
  const configured = config.knowledge_base?.inventory || {};
  const bounded = (key, minimum, maximum) =>
    Number.isInteger(configured[key]) && configured[key] >= minimum && configured[key] <= maximum
      ? configured[key]
      : DEFAULT_LIMITS[key];
  const limits = {
    max_depth: bounded('max_depth', 1, 20),
    max_tree_entries: bounded('max_tree_entries', 50, 2000),
    max_category_entries: bounded('max_category_entries', 10, 500),
    max_files_visited: bounded('max_files_visited', 100, 100000),
    max_directories_visited: bounded('max_directories_visited', 10, 20000),
    max_duration_ms: bounded('max_duration_ms', 1000, 60000)
  };
  const projectExcludes = Array.isArray(config.knowledge_base?.excludes)
    ? config.knowledge_base.excludes
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => normalize(path.normalize(value.trim()).replace(/^[/\\]+/, '')))
    : [];
  const ignored = config.knowledge_base?.inventory?.respect_gitignore === false
    ? { exact: new Set(), directoryPrefixes: [], count: 0, limited: false }
    : ignoredProjectPaths(projectRoot, limits.max_duration_ms);
  const isIgnored = (relativePath) => {
    const normalized = normalize(relativePath);
    return ignored.exact.has(normalized) || ignored.directoryPrefixes.some((entry) =>
      normalized.startsWith(entry + '/')
    );
  };
  const tree = [];
  const manifests = [];
  const entryPoints = [];
  const schemas = [];
  const tests = [];
  const sources = [];
  const truncation = {};
  if (ignored.limited) truncation.gitignore_query_limited = 1;
  const visited = { files: 0, directories: 0 };
  let stopped = false;

  function stopFor(reason) {
    truncation[reason] = (truncation[reason] || 0) + 1;
    stopped = true;
  }

  function budgetAvailable() {
    if (stopped) return false;
    if (Date.now() - startedAt >= limits.max_duration_ms) {
      stopFor('max_duration_ms');
      return false;
    }
    return true;
  }

  function walk(directory, relativeDirectory = '', depth = 0) {
    if (!budgetAvailable() || depth >= limits.max_depth ||
        isExcluded(relativeDirectory, projectExcludes, managedDocuments) || isIgnored(relativeDirectory)) {
      return;
    }
    if (visited.directories >= limits.max_directories_visited) {
      stopFor('max_directories_visited');
      return;
    }
    visited.directories += 1;
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      truncation.unreadable = (truncation.unreadable || 0) + 1;
      return;
    }
    for (const entry of entries) {
      if (!budgetAvailable()) return;
      const relativePath = path.join(relativeDirectory, entry.name);
      if (isExcluded(relativePath, projectExcludes, managedDocuments) || isIgnored(relativePath)) {
        continue;
      }
      const normalizedPath = normalize(relativePath);
      boundedPush(tree, normalizedPath + (entry.isDirectory() ? '/' : ''),
        limits.max_tree_entries, truncation, 'tree');
      if (entry.isDirectory()) {
        walk(path.join(directory, entry.name), relativePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (visited.files >= limits.max_files_visited) {
        stopFor('max_files_visited');
        return;
      }
      visited.files += 1;
      const extension = path.extname(entry.name).toLowerCase();
      const lowerPath = normalizedPath.toLowerCase();
      const categoryLimit = limits.max_category_entries;
      if (MANIFEST_NAMES.has(entry.name) || /\.(csproj|sln|slnx|gemspec)$/.test(entry.name)) {
        boundedPush(manifests, normalizedPath, categoryLimit, truncation, 'manifests');
      }
      if (ENTRY_NAMES.has(entry.name) || /(^|\/)src\/(main|index|app|server)\.[^/]+$/i.test(normalizedPath)) {
        boundedPush(entryPoints, normalizedPath, categoryLimit, truncation, 'entry_points');
      }
      if (SCHEMA_EXTENSIONS.has(extension) || /(^|\/)(schemas?|migrations?)\//i.test(normalizedPath)) {
        boundedPush(schemas, normalizedPath, categoryLimit, truncation, 'schemas');
      }
      if (/(^|\/)(__tests__|tests?|specs?)\//i.test(normalizedPath) ||
          /(?:^|[._-])(test|spec)\.[^/]+$/i.test(lowerPath)) {
        boundedPush(tests, normalizedPath, categoryLimit, truncation, 'tests');
      }
      if (SOURCE_EXTENSIONS.has(extension)) {
        boundedPush(sources, normalizedPath, categoryLimit, truncation, 'sources');
      }
    }
  }

  walk(projectRoot);
  const status = git(projectRoot, ['status', '--porcelain']);
  return {
    schema_version: '1.0',
    project_root: projectRoot,
    observation: {
      revision: git(projectRoot, ['rev-parse', '--verify', 'HEAD']),
      branch: git(projectRoot, ['branch', '--show-current']),
      worktree: status === null ? 'unknown' : status ? 'dirty' : 'clean'
    },
    hard_excludes: [...HARD_EXCLUDES, ...HARD_EXCLUDED_PATHS].sort(),
    managed_document_exclusions: managedDocuments.size,
    project_excludes: projectExcludes,
    git_ignored_entries: ignored.count,
    limits,
    visited: {
      ...visited,
      duration_ms: Date.now() - startedAt,
      stopped
    },
    truncation,
    tree,
    candidates: {
      manifests,
      entry_points: entryPoints,
      schemas,
      tests,
      sources
    }
  };
}

function parseArgs(argv) {
  let project = '.';
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--project') {
      project = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--help' || argv[index] === '-h') {
      return { help: true };
    } else {
      return { error: 'Unknown argument: ' + argv[index] };
    }
  }
  return { project };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log('Usage: node accord-inventory.mjs [--project <path>]');
    return;
  }
  if (parsed.error) {
    console.error(parsed.error);
    process.exitCode = 2;
    return;
  }
  console.log(JSON.stringify(inventoryProject(parsed.project), null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
