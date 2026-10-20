#!/usr/bin/env node
// Read-only package verification, merge planning and installation provenance.
// No downloads, dependency installation, writes, Git mutations or code execution.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseExactJson } from './tome-contracts.mjs';

const HASH = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const OFFICIAL = 'https://github.com/khuang9104/Project-Tome';
const releaseIdentity = value => value?.id === 'project-tome' && value.source_repository === OFFICIAL;
const LIMITS = { files: 4096, fileBytes: 16 * 1024 * 1024, totalBytes: 128 * 1024 * 1024 };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const parse = parseExactJson;
const normalizedText = value => value.replace(/\r\n/g, '\n');
const ABSENT = Symbol('absent');
export const INSTALLATION_RECORD = '.tome/installation.json';
const textPath = relative => /\.(?:md|mjs|js|json|ya?ml|txt|sha256)$|(?:^|\/)(?:LICENSE|TOME-LICENSE|pre-commit)$/.test(relative);
function lfDigest(content, relative) {
  if (!textPath(relative) || content.includes(0)) return undefined;
  const text = content.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(content)) return undefined;
  return digest(normalizedText(text));
}
const sameFile = (left, right, relative) => digest(left) === digest(right) ||
  (lfDigest(left, relative) !== undefined && lfDigest(left, relative) === lfDigest(right, relative));
function compareVersion(left, right) {
  if (!VERSION.test(left || '') || !VERSION.test(right || '')) return null;
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  return 0;
}
function versionTransition(from, to) {
  if (!from) return { state: 'initial', requires_decision: false };
  const comparison = compareVersion(from, to);
  if (comparison === null) return { state: 'unknown', requires_decision: true };
  if (comparison < 0) return { state: 'upgrade', requires_decision: false };
  if (comparison > 0) return { state: 'downgrade', requires_decision: true };
  return { state: 'same-release', requires_decision: false };
}

function relativePath(relative) {
  if (typeof relative !== 'string' || !relative || path.posix.normalize(relative) !== relative ||
      path.posix.isAbsolute(relative) || /[\\:\x00-\x1f]/.test(relative) || relative === '.' ||
      relative === '..' || relative.startsWith('../') || relative.split('/').some(part =>
        /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) ||
        ['.git', '.codex'].includes(part.toLowerCase()))) throw new Error('Unsafe package/installation path: ' + String(relative));
  return relative;
}

function contained(rootInput, relative, missing = false) {
  relativePath(relative);
  const root = fs.realpathSync(rootInput);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) {
      // lstat also catches a dangling link that existsSync would hide.
      try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Symbolic link is not an adoption target.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (missing) return path.join(root, ...relative.split('/'));
      throw new Error('Missing file: ' + relative);
    }
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('Symbolic link is not an adoption target: ' + relative);
    if (stat.isFile() && stat.nlink > 1) throw new Error('Hard-linked adoption file requires explicit review: ' + relative);
  }
  return current;
}

function bytes(root, relative, missing = false) {
  const file = contained(root, relative, missing);
  if (missing && !fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > LIMITS.fileBytes) throw new Error('Adoption file exceeds the regular-file budget: ' + relative);
  return fs.readFileSync(file);
}

function packageFiles(root, directory, output = [], budget = { entries: 0 }, depth = 0) {
  if (depth > 32) throw new Error('Package directory depth budget exceeded.');
  const absolute = contained(root, directory, true);
  if (!fs.existsSync(absolute)) return output;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = directory + '/' + entry.name;
    if (++budget.entries > LIMITS.files * 2 || output.length >= LIMITS.files) throw new Error('Package traversal budget exceeded.');
    contained(root, relative);
    if (entry.isDirectory()) packageFiles(root, relative, output, budget, depth + 1);
    else output.push(relative);
  }
  return output;
}

export function installationTarget(sourcePath) {
  relativePath(sourcePath);
  if (!sourcePath.startsWith('payload/')) throw new Error('Only payload files can become installation targets.');
  const relative = sourcePath.slice(8);
  if (relative === 'AGENTS.tome-block.md') return { path: 'AGENTS.md', policy: 'managed-block', block: 'tome' };
  if (relative === 'copilot-instructions.tome.md') return { path: '.github/copilot-instructions.md', policy: 'managed-block', block: 'tome:copilot' };
  if (relative.startsWith('.agents/skills/tome/')) return { path: relative, policy: 'runtime' };
  if (['.tome/tome.yaml', '.tome/documentation-policy.yaml'].includes(relative)) return { path: relative, policy: 'merge-json' };
  if (relative === '.tome/hooks/pre-commit') return { path: relative, policy: 'runtime' };
  if (relative === '.tome/release.json') return { path: relative, policy: 'runtime' };
  if (relative.startsWith('docs/')) return { path: relative, policy: 'project-owned' };
  if (relative === 'TOME-LICENSE') return { path: relative, policy: 'runtime' };
  throw new Error('Unregistered payload destination: ' + relative);
}

export function verifyReleasePackage(rootInput) {
  const root = fs.realpathSync(rootInput);
  const manifest = bytes(root, 'SHA256SUMS');
  const entries = [];
  const seen = new Set();
  let total = 0;
  for (const line of manifest.toString('utf8').split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^([a-f0-9]{64})  (RELEASE\.json|payload\/.+)$/);
    if (!match) throw new Error('Invalid SHA256SUMS entry.');
    const [, sha256, relative] = match;
    relativePath(relative);
    if (seen.has(relative.toLowerCase()) || entries.length >= LIMITS.files) throw new Error('Duplicate/case-colliding package path or file budget exceeded.');
    seen.add(relative.toLowerCase());
    const content = bytes(root, relative);
    total += content.length;
    if (total > LIMITS.totalBytes) throw new Error('Package byte budget exceeded.');
    if (digest(content) !== sha256) throw new Error('Package checksum mismatch: ' + relative);
    if (relative.startsWith('payload/')) installationTarget(relative);
    entries.push({ source_path: relative, sha256 });
  }
  const metadata = bytes(root, 'RELEASE.json');
  const actual = ['RELEASE.json', ...packageFiles(root, 'payload'), ...packageFiles(root, 'vendor')];
  if (actual.length !== entries.length || actual.some(file => !seen.has(file.toLowerCase()))) throw new Error('Package has missing or unlisted files.');
  const config = parse(bytes(root, 'payload/.tome/tome.yaml').toString('utf8'));
  const payloadMetadata = bytes(root, 'payload/.tome/release.json', true);
  const release = parse(metadata.toString('utf8'));
  if (!object(release) || !payloadMetadata || !sameFile(metadata, payloadMetadata, 'RELEASE.json') ||
      release.schema_version !== '1.0' || !releaseIdentity(release) ||
      !VERSION.test(release.release_version || '') ||
      !VERSION.test(release.protocol_version || '') ||
      release.payload_release_path !== '.tome/release.json' ||
      release.checksum_manifest !== 'SHA256SUMS' || release.update_contract !== 'tome-adoption-v1' ||
      config.tome?.release !== release.release_version || config.tome?.version !== release.protocol_version) {
    throw new Error('Release metadata is missing, invalid or inconsistent with the payload.');
  }
  const knowledge = parse(bytes(root, 'payload/docs/manifest.yaml').toString('utf8'));
  const empty = value => Array.isArray(value) && value.length === 0;
  if (knowledge.schema_version !== '2.0' || config.schema_version !== '1.0' || config.sources?.engineering !== undefined) throw new Error('Incoming package must use current Project Tome schemas.');
  const pristineKnowledge = empty(knowledge.module_files) && Array.isArray(knowledge.documents) && knowledge.documents.every(d => d.status === 'draft' && d.review === undefined);
  if (config.project?.id !== 'replace-with-project-id' ||
      (config.sources?.engineering !== undefined && !empty(config.sources.engineering)) ||
      knowledge.status !== 'draft' || !pristineKnowledge) {
    throw new Error('Source contains project identity or knowledge state; use a clean distribution, not another adopted project.');
  }
  return { root, package_sha256: digest(manifest), files: entries, config, release,
    limitation: 'Checksums verify this file set, not publisher identity, human approval or executable safety.' };
}

function same(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => same(value, b[index]));
  if (object(a) && object(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => own(b, key) && same(a[key], b[key]));
  }
  return false;
}

export function mergeJson(base, local, incoming) {
  const conflicts = [];
  function merge(before, current, next, pointer) {
    if (same(current, next) || same(before, next)) return current;
    if (same(before, current)) return next;
    if (object(current) && object(next) && (object(before) || before === ABSENT)) {
      const result = {};
      for (const key of [...new Set([...Object.keys(current), ...Object.keys(next), ...Object.keys(before === ABSENT ? {} : before)])].sort()) {
        const value = merge(before !== ABSENT && own(before, key) ? before[key] : ABSENT,
          own(current, key) ? current[key] : ABSENT, own(next, key) ? next[key] : ABSENT,
          pointer + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1'));
        if (value !== ABSENT) Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true });
      }
      return result;
    }
    conflicts.push(pointer || '/');
    return current;
  }
  return { value: merge(base === undefined ? ABSENT : base, local, incoming, ''), conflicts };
}

function block(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const starts = [...text.matchAll(new RegExp('<!-- ' + escaped + ':begin(?: version="[^"]+")? -->', 'g'))];
  const ends = [...text.matchAll(new RegExp('<!-- ' + escaped + ':end -->', 'g'))];
  if (!starts.length && !ends.length) return null;
  if (starts.length !== 1 || ends.length !== 1 || starts[0].index >= ends[0].index) throw new Error('Malformed or duplicate managed entry blocks.');
  const start = starts[0].index;
  const end = ends[0].index + ends[0][0].length;
  return { start, end, text: text.slice(start, end) };
}

export function mergeManagedEntry(local, incoming, previous, name = 'tome') {
  const next = block(incoming, name);
  if (!next) throw new Error('Package managed entry block is missing.');
  const current = block(local, name);
  const newline = local.includes('\r\n') ? '\r\n' : '\n';
  const nextText = normalizedText(next.text).replaceAll('\n', newline);
  if (!current) return { action: 'merge-entry', content: local + (local && !local.endsWith(newline + newline) ? (local.endsWith(newline) ? newline : newline + newline) : '') + nextText + newline };
  if (normalizedText(current.text) === normalizedText(next.text)) return { action: 'unchanged', content: local };
  const before = previous === undefined ? null : block(previous, name);
  if (before && normalizedText(current.text) === normalizedText(before.text)) return { action: 'merge-entry', content: local.slice(0, current.start) + nextText + local.slice(current.end) };
  if (before && normalizedText(next.text) === normalizedText(before.text)) return { action: 'preserve-local', content: local };
  return { action: 'conflict', content: local, reason: 'Managed block differs locally; inspect the three-way diff before editing.' };
}

function recordPathPolicy(entry) {
  const target = installationTarget(entry.source_path);
  if (target.path !== entry.path || target.policy !== entry.policy || !HASH.test(entry.source_sha256 || '') ||
      (entry.source_lf_sha256 !== undefined && (!HASH.test(entry.source_lf_sha256) || !textPath(entry.path) || target.policy !== 'runtime'))) throw new Error('Installation record has an invalid owner or source hash.');
  return target;
}

export function validateInstallationRecord(projectRoot, record, projectId) {
  const errors = [];
  const warnings = [];
  const structuralErrors = [];
  const drift = [];
  const result = () => ({ errors: [...structuralErrors, ...errors], warnings, structural_errors: structuralErrors, drift });
  if (!object(record) || record.schema_version !== '1.1' || typeof projectId !== 'string' || !projectId.trim() || projectId === 'replace-with-project-id' || record.project_id !== projectId ||
      record.source?.repository !== OFFICIAL || !REVISION.test(record.source?.revision || '') ||
      !HASH.test(record.source?.package_sha256 || '') || !['clean', 'dirty', 'unknown'].includes(record.source?.worktree) ||
      !object(record.protocol) || !VERSION.test(record.protocol.release || '') ||
      ['version', 'configuration', 'knowledge'].some(key => typeof record.protocol[key] !== 'string' || !record.protocol[key]) ||
      !Array.isArray(record.files) || !record.files.length || record.files.length > LIMITS.files ||
      !Array.isArray(record.local_changes) || record.local_changes.length > LIMITS.files) {
    structuralErrors.push('Invalid installation record identity, source, schema or file inventory.');
    return result();
  }
  const seen = new Set();
  const local = new Map();
  for (const change of record.local_changes) {
    try {
      if (!object(change) || typeof change.path !== 'string' || local.has(change.path.toLowerCase()) || !HASH.test(change.sha256 || '') ||
          typeof change.basis !== 'string' || !change.basis.trim()) throw new Error('Local installation differences need one path, exact hash and review basis.');
      relativePath(change.path);
      local.set(change.path.toLowerCase(), change);
    } catch (error) { structuralErrors.push(error.message); }
  }
  const owners = [];
  for (const entry of record.files) {
    try {
      const target = recordPathPolicy(entry);
      if (seen.has(entry.path.toLowerCase())) throw new Error('Duplicate installation owner.');
      seen.add(entry.path.toLowerCase());
      if (local.has(entry.path.toLowerCase()) && local.get(entry.path.toLowerCase()).path !== entry.path) throw new Error('Local customization path must exactly match its owner.');
      owners.push({ entry, target });
    } catch (error) { structuralErrors.push(error.message); }
  }
  for (const required of ['AGENTS.md', '.github/copilot-instructions.md', '.tome/tome.yaml', '.agents/skills/tome/SKILL.md', '.agents/skills/tome/scripts/tome-validate.mjs', '.tome/release.json']) {
    if (!seen.has(required.toLowerCase())) structuralErrors.push('Installation record omits a required owner: ' + required);
  }
  for (const change of local.values()) if (!seen.has(change.path.toLowerCase())) structuralErrors.push('Local change has no installed owner: ' + change.path);
  if (structuralErrors.length) return result();
  for (const { entry, target } of owners) {
    try {
      // Canonical project documents are validated by their current registry, not
      // rehashed against installation seeds on every task. Renames are legitimate.
      if (target.policy === 'project-owned' && !local.has(entry.path.toLowerCase())) {
        const file = contained(projectRoot, entry.path, true);
        if (fs.existsSync(file) && !fs.statSync(file).isFile()) throw new Error('Project owner is not a regular file: ' + entry.path);
        continue;
      }
      const content = bytes(projectRoot, entry.path);
      const actual = target.policy === 'managed-block' ? block(content.toString('utf8'), target.block)?.text : content;
      if (actual === undefined) throw new Error('Managed installation block is absent: ' + entry.path);
      const observed = digest(target.policy === 'managed-block' ? normalizedText(actual) : actual);
      const observedLf = target.policy === 'runtime' ? lfDigest(content, entry.path) : undefined;
      const customization = local.get(entry.path.toLowerCase());
      const customized = customization && [observed, observedLf].includes(customization.sha256);
      if (customization && !customized) throw new Error('Recorded local customization no longer matches: ' + entry.path);
      const sourceMatches = observed === entry.source_sha256 || (observedLf !== undefined && observedLf === entry.source_lf_sha256);
      if (['runtime', 'managed-block'].includes(entry.policy) && !sourceMatches && !customized) {
        throw new Error('Unexplained installed runtime/entry drift: ' + entry.path);
      }
    } catch (error) {
      errors.push(error.message);
      drift.push({ path: entry.path, reason: error.message });
    }
  }
  if (record.source.worktree !== 'clean') warnings.push('Installation source was ' + record.source.worktree + '; source commit alone does not identify the installed package.');
  warnings.push('Installation record checks declared provenance, not publisher identity or genuine human approval.');
  return result();
}

export function inspectInstallation(projectRoot, config) {
  const errors = [];
  const warnings = [];
  const paths = [];
  try {
    const content = bytes(projectRoot, '.tome/release.json', true);
    if (content) {
      paths.push('.tome/release.json');
      const metadata = parse(content.toString('utf8'));
      if (metadata?.schema_version !== '1.0' || !releaseIdentity(metadata) ||
          !VERSION.test(metadata?.release_version || '') || !VERSION.test(metadata?.protocol_version || '') ||
          metadata?.payload_release_path !== '.tome/release.json' ||
          metadata?.checksum_manifest !== 'SHA256SUMS' || metadata?.update_contract !== 'tome-adoption-v1') {
        errors.push('Invalid installed release metadata identity or update contract.');
      }
      if (metadata?.release_version !== config?.tome?.release || metadata?.protocol_version !== config?.tome?.version) errors.push('Configuration and release metadata versions do not match.');
    } else if (config?.tome?.release !== undefined) errors.push('Missing installed release metadata: .tome/release.json.');
    else errors.push('Release metadata is required; complete Project Tome adoption.');
  } catch (error) { errors.push('Release metadata: ' + error.message); }
  const configured = config?.tome?.installation_record;
  if (configured !== undefined && configured !== INSTALLATION_RECORD) {
    return { errors: ['tome.installation_record must be ' + INSTALLATION_RECORD + '.'], warnings, paths };
  }
  try {
    const content = bytes(projectRoot, INSTALLATION_RECORD, true);
    if (!content) {
      if (configured) errors.push('Missing installation record: ' + INSTALLATION_RECORD + '. Complete the reviewed adoption; do not invent an old baseline.');
      else errors.push('Installation receipt is required; complete Project Tome adoption.');
      return { errors, warnings, paths };
    }
    paths.push(INSTALLATION_RECORD);
    const record = parse(content.toString('utf8'));
    const checked = validateInstallationRecord(projectRoot, record, config?.project?.id);
    errors.push(...checked.errors);
    warnings.push(...checked.warnings);
    if (!checked.structural_errors.length && (record.protocol.release !== config?.tome?.release ||
        record.protocol.version !== config?.tome?.version ||
        record.protocol.configuration !== config?.schema_version || record.protocol.knowledge !== config?.knowledge_base?.structure_version)) {
      errors.push('Installation protocol versions do not match project configuration; review the current configuration and installation record together.');
    }
  } catch (error) { errors.push('Installation record: ' + error.message); }
  return { errors, warnings, paths };
}

export function planAdoption(projectRoot, packageRoot, { previousPackageRoot } = {}) {
  const incoming = verifyReleasePackage(packageRoot);
  const previous = previousPackageRoot ? verifyReleasePackage(previousPackageRoot) : null;
  const oldFiles = new Set(previous?.files.map(entry => entry.source_path) || []);
  const actions = [];
  const seenTargets = new Set();
  const priorRecord = bytes(projectRoot, INSTALLATION_RECORD, true);
  const record = priorRecord ? parse(priorRecord.toString('utf8')) : null;
  let installationIssues = [];
  if (record) {
    const localConfig = parse(bytes(projectRoot, '.tome/tome.yaml').toString('utf8'));
    const checked = validateInstallationRecord(projectRoot, record, localConfig.project?.id);
    if (checked.structural_errors.length) throw new Error('Existing installation record requires reconciliation: ' + checked.structural_errors.join('; '));
    installationIssues = checked.drift;
    if (previous && previous.package_sha256 !== record.source.package_sha256) throw new Error('The previous package does not match the installation record; do not use it as a three-way baseline.');
  }
  const recorded = new Map(Array.isArray(record?.files) ? record.files.map(entry => [entry.path, entry]) : []);
  for (const entry of incoming.files.filter(file => file.source_path.startsWith('payload/'))) {
    const target = installationTarget(entry.source_path);
    seenTargets.add(target.path);
    const local = bytes(projectRoot, target.path, true);
    const next = bytes(incoming.root, entry.source_path);
    const before = oldFiles.has(entry.source_path) ? bytes(previous.root, entry.source_path) : null;
    const recordedHash = recorded.get(target.path)?.source_sha256;
    const recordedLfHash = recorded.get(target.path)?.source_lf_sha256;
    let action;
    if (target.policy === 'managed-block') {
      const merged = mergeManagedEntry(local?.toString('utf8') || '', next.toString('utf8'), before?.toString('utf8'), target.block);
      if (!before && merged.action === 'conflict' && recordedHash) {
        const current = block(local.toString('utf8'), target.block);
        const nextBlock = block(next.toString('utf8'), target.block);
        if (current && digest(normalizedText(current.text)) === recordedHash) merged.action = 'merge-entry';
        else if (digest(normalizedText(nextBlock.text)) === recordedHash) merged.action = 'preserve-local';
        if (merged.action !== 'conflict') delete merged.reason;
      }
      action = { action: merged.action, ...(merged.reason ? { reason: merged.reason } : {}) };
    } else if (!local) action = { action: 'create' };
    else if (sameFile(local, next, target.path)) action = { action: 'unchanged' };
    else if (target.policy === 'project-owned') action = { action: 'preserve-project' };
    else if (target.policy === 'merge-json') {
      if (!before) {
        parse(local.toString('utf8'));
        action = recordedHash === entry.sha256 ? { action: 'preserve-local' }
          : { action: 'review-merge', reason: 'No trusted old JSON body; retain local configuration and merge required fields explicitly.' };
      }
      else {
        const current = parse(local.toString('utf8'));
        const merged = mergeJson(parse(before.toString('utf8')), current, parse(next.toString('utf8')));
        action = { action: merged.conflicts.length ? 'conflict' : same(merged.value, current) ? 'preserve-local' : 'merge-json', conflicts: merged.conflicts };
      }
    } else if ((before && sameFile(local, before, target.path)) || (!before &&
      (recordedHash === digest(local) || (recordedLfHash !== undefined && recordedLfHash === lfDigest(local, target.path))))) action = { action: 'update' };
    else if ((before && sameFile(before, next, target.path)) || (!before &&
      (recordedHash === entry.sha256 || (recordedLfHash !== undefined && recordedLfHash === lfDigest(next, target.path))))) action = { action: 'preserve-local' };
    else action = { action: 'conflict', reason: 'Local runtime differs and cannot be replaced without review.' };
    actions.push({ ...target, source_path: entry.source_path, ...action });
  }
  for (const entry of recorded.values()) {
    recordPathPolicy(entry);
    if (!seenTargets.has(entry.path)) actions.push({ path: entry.path, policy: entry.policy, action: 'review-retirement', reason: 'No longer in the package; no deletion is authorized by this plan.' });
  }
  const version = versionTransition(record?.protocol?.release, incoming.release.release_version);
  return { schema_version: '1.0', mode: record ? 'existing-project' :
    fs.existsSync(path.join(projectRoot, '.tome')) || fs.existsSync(path.join(projectRoot, '.agents/skills/tome')) ? 'partial' : 'initial',
    from_release: record?.protocol?.release ?? null, to_release: incoming.release.release_version,
    version_transition: version.state, version_decision_required: version.requires_decision,
    previous_package_sha256: record?.source?.package_sha256 ?? null,
    package_sha256: incoming.package_sha256, actions, installation_issues: installationIssues, writes_performed: false,
    limitation: 'Plans do not install, authorize changes or certify completion. A downgrade or unknown version transition needs an explicit human decision. Recheck exact targets immediately before applying approved edits.' };
}

export function createInstallationRecord(projectRoot, packageRoot, source, localChanges = []) {
  const pkg = verifyReleasePackage(packageRoot);
  const config = parse(bytes(projectRoot, '.tome/tome.yaml').toString('utf8'));
  if (source?.repository !== OFFICIAL || !REVISION.test(source?.revision || '') || !['clean', 'dirty', 'unknown'].includes(source?.worktree)) throw new Error('Record requires official source, observed full revision and worktree state; do not invent missing provenance.');
  const files = pkg.files.filter(entry => entry.source_path.startsWith('payload/')).map(entry => {
    const target = installationTarget(entry.source_path);
    const original = bytes(pkg.root, entry.source_path);
    const sourceHash = target.policy === 'managed-block' ? digest(normalizedText(block(original.toString('utf8'), target.block).text)) : entry.sha256;
    const sourceLfHash = target.policy === 'runtime' ? lfDigest(original, target.path) : undefined;
    return { path: target.path, policy: target.policy, source_path: entry.source_path, source_sha256: sourceHash,
      ...(sourceLfHash === undefined ? {} : { source_lf_sha256: sourceLfHash }) };
  });
  if (config.tome?.release !== pkg.release.release_version || config.tome?.version !== pkg.release.protocol_version) throw new Error('Project configuration release/protocol does not match the requested Release; finish the merge before recording.');
  const record = { schema_version: '1.1', project_id: config.project?.id,
    source: { ...source, package_sha256: pkg.package_sha256 },
    protocol: { release: pkg.release.release_version, version: pkg.config.tome.version, configuration: config.schema_version, knowledge: config.knowledge_base?.structure_version },
    files, local_changes: localChanges };
  const validation = validateInstallationRecord(projectRoot, record, config.project?.id);
  if (validation.errors.length) throw new Error(validation.errors.join('\n'));
  record.local_changes = localChanges.map(change => {
    const entry = files.find(file => file.path === change.path);
    const normalized = entry?.policy === 'runtime' ? lfDigest(bytes(projectRoot, change.path), change.path) : undefined;
    return { ...change, sha256: normalized ?? change.sha256 };
  });
  return record;
}

export function verifyInstalledPackage(projectRoot, packageRoot, { revision } = {}) {
  const errors = [];
  const pkg = verifyReleasePackage(packageRoot);
  let config;
  let record;
  try {
    config = parse(bytes(projectRoot, '.tome/tome.yaml').toString('utf8'));
    if (!object(config)) throw new Error('Expected a configuration object.');
  } catch (error) {
    errors.push('Installed project configuration is missing or invalid: ' + error.message);
  }
  try {
    record = parse(bytes(projectRoot, INSTALLATION_RECORD).toString('utf8'));
    if (!object(record)) throw new Error('Expected an installation record object.');
  } catch (error) {
    errors.push('Installed project has no valid installation record: ' + error.message);
  }
  if (config && record) {
    const checked = inspectInstallation(projectRoot, config);
    errors.push(...checked.errors);
    if (revision !== undefined && (!REVISION.test(revision) || record.source?.revision !== revision)) errors.push('Installation source revision does not match the requested commit.');
    if (record.source?.package_sha256 !== pkg.package_sha256) {
      errors.push('Installation record package digest does not match the requested Release.');
    }
    if (record.protocol?.release !== pkg.release.release_version ||
        record.protocol?.version !== pkg.release.protocol_version) {
      errors.push('Installation record release and protocol versions do not match the requested Release.');
    }
    const recorded = new Map(Array.isArray(record.files) ? record.files.filter(object).map(entry => [entry.path, entry]) : []);
    const expectedPaths = new Set();
    for (const entry of pkg.files.filter(file => file.source_path.startsWith('payload/'))) {
      const target = installationTarget(entry.source_path);
      expectedPaths.add(target.path);
      const expectedSource = bytes(pkg.root, entry.source_path);
      const expectedHash = target.policy === 'managed-block'
        ? digest(normalizedText(block(expectedSource.toString('utf8'), target.block).text))
        : entry.sha256;
      const installed = recorded.get(target.path);
      const expectedLfHash = target.policy === 'runtime' ? lfDigest(expectedSource, target.path) : undefined;
      if (!installed) {
        errors.push('Installation record is missing the Release-owned file: ' + target.path);
      } else if (installed.source_path !== entry.source_path || installed.policy !== target.policy ||
          installed.source_sha256 !== expectedHash || installed.source_lf_sha256 !== expectedLfHash) {
        errors.push('Installation record does not describe the requested Release file: ' + target.path);
      }
    }
    for (const installedPath of recorded.keys()) if (!expectedPaths.has(installedPath)) errors.push('Installation record contains an owner outside the requested Release: ' + installedPath);
  }
  return {
    verified: errors.length === 0,
    release_version: pkg.release.release_version,
    protocol_version: pkg.release.protocol_version,
    package_sha256: pkg.package_sha256,
    expected_payload_files: pkg.files.filter(file => file.source_path.startsWith('payload/')).length,
    source_revision: record?.source?.revision ?? null,
    local_changes: record?.local_changes ?? [],
    errors,
    limitation: 'File conformance with declared local exceptions only. Run the requested Release validator and resolve every plan action, including configuration updates and retirements. Not publisher authentication or acceptance.'
  };
}

export function main(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!['--project', '--package', '--previous-package', '--mode', '--revision', '--worktree', '--local-changes'].includes(args[index]) ||
        own(values, args[index]) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Invalid adoption planning arguments. No write/apply/install mode exists.');
    values[args[index]] = args[index + 1];
  }
  const mode = values['--mode'] || 'plan';
  if (values['--local-changes'] && mode !== 'record') throw new Error('--local-changes is only valid for record mode.');
  if ((mode !== 'status' && !values['--package']) || (mode !== 'verify-package' && !values['--project'])) throw new Error('Package and, for target operations, project are required (status needs only project).');
  let result;
  if (mode === 'status') {
    const config = parse(bytes(values['--project'], '.tome/tome.yaml').toString('utf8'));
    const checked = inspectInstallation(values['--project'], config);
    const content = bytes(values['--project'], INSTALLATION_RECORD, true);
    const record = content ? parse(content.toString('utf8')) : null;
    result = { valid: !checked.errors.length, release_version: config.tome?.release ?? null,
      protocol_version: config.tome?.version ?? null, record_schema: record?.schema_version ?? null,
      source_revision: record?.source?.revision ?? null, package_sha256: record?.source?.package_sha256 ?? null,
      errors: checked.errors, warnings: checked.warnings,
      limitation: 'Local declared state only; does not establish completeness against a requested package or check GitHub for updates.' };
  }
  else if (mode === 'verify-package') { const pkg = verifyReleasePackage(values['--package']); result = { release_version: pkg.release.release_version, protocol_version: pkg.release.protocol_version, package_sha256: pkg.package_sha256, files: pkg.files.length, limitation: pkg.limitation }; }
  else if (mode === 'plan') result = planAdoption(values['--project'], values['--package'], { previousPackageRoot: values['--previous-package'] });
  else if (mode === 'record') result = createInstallationRecord(values['--project'], values['--package'],
    { repository: OFFICIAL, revision: values['--revision'], worktree: values['--worktree'] || 'unknown' },
    values['--local-changes'] ? parse(bytes(values['--project'], values['--local-changes']).toString('utf8')) : []);
  else if (mode === 'verify-installation') result = verifyInstalledPackage(values['--project'], values['--package'], { revision: values['--revision'] });
  else throw new Error('Unsupported mode; use status, verify-package, plan, record or verify-installation. All modes only print results.');
  console.log(JSON.stringify(result, null, 2));
  if (mode === 'verify-installation' && !result.verified) process.exitCode = 1;
  if (mode === 'status' && !result.valid) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
