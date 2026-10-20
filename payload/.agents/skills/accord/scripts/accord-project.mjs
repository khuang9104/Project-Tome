#!/usr/bin/env node
// Knowledge ownership, retrieval and review observations. Never executes document content.
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseExactJson, inspectContract, compareContracts } from './accord-contracts.mjs';
import { captureObservation, readSnapshotFile, readSnapshotFiles, listSnapshotFiles, sourcePath, headRevision } from './accord-scope.mjs';
import { CONFIG_SCHEMA, KNOWLEDGE_SCHEMA } from './accord-protocol.mjs';

export const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export const ID = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
export const SHA = /^[a-f0-9]{40,64}$/;
export const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export const strings = x => Array.isArray(x) && x.length <= 10000 && x.every(y => typeof y === 'string' && y.trim()) && new Set(x).size === x.length;
export const relativePath = sourcePath;
export const owns = (prefix, file) => file === prefix || file.startsWith(prefix + '/');
export function readBytes(root, relative, limit = 2 * 1024 * 1024, view = {}) {
  const bytes = view.cache?.get(relative) || readSnapshotFile(root, relative, view);
  if (bytes.length > limit) throw new Error('File exceeds byte budget: ' + relative);
  return bytes;
}
export const readJson = (root, file, view = {}) => parseExactJson(readBytes(root, file, undefined, view).toString('utf8'));
function preload(root, files, view) {
  if (!view.staged && !view.revision) return;
  view.cache ||= new Map();
  const paths = [...new Set(files)].filter(p => !view.cache.has(p));
  if (paths.length) for (const [file, bytes] of readSnapshotFiles(root, paths, { ...view, tolerateMissing: true })) view.cache.set(file, bytes);
}
export function gitRead(root, args) {
  const r = spawnSync('git', ['--literal-pathspecs', ...args], { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 30000 });
  if (r.status !== 0 || r.error) throw new Error('Git inspection failed: ' + args[0]);
  return r.stdout;
}
export function validateDocumentationPolicy(policy) {
  const errors = [];
  if (!object(policy) || policy.schema_version !== '1.0' || !Array.isArray(policy.rules) || !Array.isArray(policy.excludes) || policy.rules.length > 1000 || policy.excludes.length > 1000) return ['Invalid documentation policy.'];
  const ids = new Set();
  for (const r of policy.rules) {
    if (!ID.test(r?.id || '') || ids.has(r.id) || !strings(r.kinds) || !strings(r.topics) || !r.kinds.length ||
        !['combined-or-split', 'separate-topics'].includes(r.layout) || (r.modules !== undefined && !strings(r.modules)) ||
        (r.min_files !== undefined && (!Number.isInteger(r.min_files) || r.min_files < 1)) ||
        (r.max_files !== undefined && (!Number.isInteger(r.max_files) || r.max_files < (r.min_files || 1)))) errors.push('Invalid documentation rule: ' + r?.id);
    ids.add(r?.id);
  }
  for (const e of policy.excludes) { try { relativePath(e.path); if (!e.reason?.trim()) throw new Error('Missing exclusion reason.'); } catch (error) { errors.push(error.message); } }
  return errors;
}
export function loadProjectModel(root, config = null, manifest = null, view = {}) {
  view = { ...view, cache: new Map() };
  config ||= readJson(root, '.accord/accord.yaml', view);
  if (config.schema_version !== CONFIG_SCHEMA || config.knowledge_base?.structure_version !== KNOWLEDGE_SCHEMA) throw new Error('Migrate configuration to 1.0 before using the knowledge runtime.');
  const manifestPath = config.knowledge_base.manifest || 'docs/manifest.yaml';
  manifest ||= readJson(root, manifestPath, view);
  if (manifest.schema_version !== KNOWLEDGE_SCHEMA || manifest.structure !== 'accord-project-knowledge' ||
      !['draft', 'current'].includes(manifest.status) || !strings(manifest.module_files) || !Array.isArray(manifest.documents)) throw new Error('Expected knowledge 2.0 registry.');
  relativePath(manifest.knowledge_root);
  const policyPath = config.documentation?.policy;
  preload(root, [...manifest.module_files, ...(policyPath ? [policyPath] : [])], view);
  const policy = policyPath ? readJson(root, policyPath, view) : { schema_version: '1.0', rules: [], excludes: [] };
  const errors = validateDocumentationPolicy(policy);
  const modules = manifest.module_files.map(file => ({ ...readJson(root, file, view), metadata_path: file }));
  const byId = new Map(), prefixes = new Set();
  for (const m of modules) {
    if (!ID.test(m.id || '') || byId.has(m.id) || !strings(m.kinds) || !m.kinds.length || !strings(m.source_paths) || !strings(m.depends_on) ||
        !Array.isArray(m.documents) || !(m.parent === null || ID.test(m.parent || '')) || !['draft', 'current'].includes(m.status) || !strings(m.gaps) ||
        (m.aliases !== undefined && !strings(m.aliases))) { errors.push('Invalid module: ' + m.id); continue; }
    byId.set(m.id, m);
    for (const prefix of m.source_paths) { relativePath(prefix); if (prefixes.has(prefix.toLowerCase())) errors.push('Duplicate source ownership: ' + prefix); prefixes.add(prefix.toLowerCase()); }
  }
  for (const m of modules) {
    if (!strings(m.depends_on)) continue;
    if (m.not_applicable !== undefined && (!Array.isArray(m.not_applicable) || m.not_applicable.some(e => !e?.topic?.trim() || !e.reason?.trim()))) errors.push('Invalid non-applicability: ' + m.id);
    if (m.depends_on.some(id => !byId.has(id)) || (m.parent !== null && !byId.has(m.parent))) errors.push('Unresolved module relationship: ' + m.id);
    const seen = new Set([m.id]); let parent = m.parent;
    while (parent && byId.has(parent)) { if (seen.has(parent)) { errors.push('Module hierarchy cycle: ' + m.id); break; } seen.add(parent); parent = byId.get(parent).parent; }
  }
  const documents = [...manifest.documents.map(d => ({ ...d, module: null })), ...modules.flatMap(m => m.documents.map(d => ({ ...d, module: m.id })))];
  const ids = new Set(), paths = new Set();
  for (const d of documents) {
    relativePath(d.path);
    if (!ID.test(d.id || '') || ids.has(d.id) || paths.has(d.path.toLowerCase()) || !strings(d.topics) || !d.topics.length || !strings(d.refs) ||
        !strings(d.requirements) || !strings(d.audience) || !d.audience.length || !['draft', 'approved-target', 'observed', 'gap', 'retired'].includes(d.status) ||
        !['public', 'internal', 'restricted'].includes(d.sensitivity) || (d.aliases !== undefined && !strings(d.aliases)) ||
        (d.sources !== undefined && !strings(d.sources)) || (d.gaps !== undefined && !strings(d.gaps)) ||
        (d.review !== undefined && (!object(d.review) || !/^[a-f0-9]{64}$/.test(d.review.sha256 || '') || !d.review.basis?.trim()))) errors.push('Invalid document: ' + d.id);
    d.sources?.forEach(relativePath); ids.add(d.id); paths.add(d.path.toLowerCase());
  }
  if (manifest.exact_contracts !== undefined && (!Array.isArray(manifest.exact_contracts) || manifest.exact_contracts.length > 10000)) errors.push('Invalid exact-contract registry.');
  if (errors.length) throw new Error(errors.join('\n'));
  return { root, config, manifest, policy, modules, documents, view,
    metadata_paths: ['.accord/accord.yaml', manifestPath, ...(policyPath ? [policyPath] : []), ...manifest.module_files],
    fingerprint: digest(JSON.stringify({ manifest, policy, modules })) };
}
export function moduleClosure(model, seeds, impact = false) {
  if (!strings(seeds) || seeds.some(id => !model.modules.some(m => m.id === id))) throw new Error('Select distinct registered modules.');
  const selected = new Set(seeds);
  if (impact) for (let changed = true; changed;) { changed = false; for (const m of model.modules) if (!selected.has(m.id) && m.depends_on.some(id => selected.has(id))) { selected.add(m.id); changed = true; } }
  const affected = [...selected], queue = [...selected];
  for (let i = 0; i < queue.length; i++) {
    const m = model.modules.find(m => m.id === queue[i]);
    for (const id of [...m.depends_on, ...(m.parent ? [m.parent] : [])]) if (!selected.has(id)) { selected.add(id); queue.push(id); }
  }
  return { affected: affected.sort(), context: [...selected].sort() };
}
function documentClosure(model, initial) {
  const byId = new Map(model.documents.map(d => [d.id, d])), documents = initial.filter(d => d.status !== 'retired');
  const chosen = new Set(documents.map(d => d.id)), gaps = [];
  for (let i = 0; i < documents.length; i++) for (const id of documents[i].refs) {
    const target = byId.get(id);
    if (!target || target.status === 'retired') gaps.push({ document: documents[i].id, reference: id, reason: 'referenced owner missing or retired' });
    else if (!chosen.has(id)) { chosen.add(id); documents.push(target); }
  }
  return { documents, gaps };
}
export function selectProjectContext(model, { modules = [], query = '', impact = false, documents = [] } = {}) {
  if (!strings(documents) || documents.some(id => !model.documents.some(d => d.id === id))) throw new Error('Unknown document ID.');
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean), matches = new Map(), searchGaps = [];
  let scanned = 0;
  for (const d of model.documents.filter(d => d.status !== 'retired')) {
    const module = model.modules.find(m => m.id === d.module);
    const metadata = [d.id, d.path, ...d.topics, ...d.requirements, ...(d.aliases || []), ...(module?.aliases || [])].join(' ').toLowerCase();
    if (terms.some(t => metadata.includes(t))) { matches.set(d.id, { field: 'metadata' }); continue; }
    if (!terms.length) continue;
    try {
      if (scanned >= 32 * 1024 * 1024) { searchGaps.push({ document: d.id, reason: 'content search budget reached; narrow the query' }); continue; }
      const bytes = readBytes(model.root, d.path, undefined, model.view); scanned += bytes.length;
      const lines = bytes.toString('utf8').split(/\r?\n/), index = lines.findIndex(line => terms.some(t => line.toLowerCase().includes(t)));
      if (index >= 0) matches.set(d.id, { field: 'content', line: index + 1, excerpt: lines[index].slice(0, 200) });
    } catch (error) { searchGaps.push({ document: d.id, reason: error.message }); }
  }
  const moduleMatches = model.modules.filter(m => terms.some(t => [m.id, ...(m.aliases || []), ...m.source_paths].join(' ').toLowerCase().includes(t))).map(m => m.id);
  const seeds = [...new Set([...modules, ...moduleMatches, ...model.documents.filter(d => (documents.includes(d.id) || matches.has(d.id)) && d.module).map(d => d.module)])];
  const scope = moduleClosure(model, seeds, impact);
  const selected = documentClosure(model, model.documents.filter(d => documents.includes(d.id) || matches.has(d.id) || scope.context.includes(d.module) ||
    (!d.module && d.topics.some(t => ['needs', 'decisions', 'continuity', 'architecture', 'system-constraints'].includes(t)))));
  return { schema_version: '1.0', status: seeds.length || documents.length || matches.size ? 'selected' : 'needs-scope', scope, metadata_fingerprint: model.fingerprint,
    modules: model.modules.filter(m => scope.context.includes(m.id)).map(m => ({ id: m.id, parent: m.parent, source_paths: m.source_paths, depends_on: m.depends_on, status: m.status, gaps: m.gaps, observation: m.observation || null })),
    documents: selected.documents.map(d => ({ id: d.id, path: d.path, module: d.module, topics: d.topics, status: d.status, review: d.review || null, freshness: 'not-checked-by-selection',
      reason: documents.includes(d.id) ? 'explicit' : matches.has(d.id) ? 'query' : 'scope-or-reference', ...(matches.has(d.id) ? { match: matches.get(d.id) } : {}) })),
    gaps: [...selected.gaps, ...searchGaps, ...selected.documents.filter(d => !d.review || d.gaps?.length).map(d => ({ document: d.id, reason: !d.review ? 'review missing' : 'declared coverage gaps', details: d.gaps || [] })), ...model.modules.filter(m => scope.context.includes(m.id) && (m.status !== 'current' || m.gaps.length)).map(m => ({ module: m.id, reasons: m.gaps, status: m.status }))],
    required_probes: impact ? ['actual consumers and imports', 'shared data and configuration', 'dynamic boundaries', 'proposed diff versus selected scope'] : [],
    limitation: 'Selected context, not proof of completeness. Inspect relevant missing, stale or disputed facts.' };
}
export function sourceOwner(model, file) {
  return model.modules.flatMap(m => m.source_paths.filter(p => owns(p, file)).map(p => ({ id: m.id, length: p.length }))).sort((a, b) => b.length - a.length)[0]?.id || model.documents.find(d => d.path === file)?.module || null;
}
export function reviewKnowledge(model, { modules = [], documents = [] } = {}) {
  moduleClosure(model, modules);
  if (!strings(documents) || documents.some(id => !model.documents.some(d => d.id === id))) throw new Error('Unknown document ID.');
  const chosen = documentClosure(model, model.documents.filter(d => modules.includes(d.module) || documents.includes(d.id)));
  preload(model.root, chosen.documents.map(d => d.path), model.view);
  return { claim: 'Candidate observations only. Inspect actual meaning and record an honest review basis before using these values.',
    document_reviews: chosen.documents.map(d => ({ id: d.id, path: d.path, sha256: digest(readBytes(model.root, d.path, undefined, model.view)),
      ...(d.sources?.length ? { observation: captureObservation(model.root, d.sources, model.view) } : {}) })),
    module_observations: model.modules.filter(m => modules.includes(m.id)).map(m => ({ id: m.id, observation: m.source_paths.length ? captureObservation(model.root, m.source_paths, model.view) : null })), gaps: chosen.gaps };
}
export function validateProjectKnowledge(model, { modules = null, documents = [], inventory = true, strict = false, includeSystem = true, dependencies = true } = {}) {
  const errors = [], gaps = [], inspected = [];
  const scope = modules?.length ? (dependencies ? moduleClosure(model, modules).context : modules) : modules === null ? model.modules.map(m => m.id) : [];
  if (scope.some(id => !model.modules.some(m => m.id === id))) throw new Error('Unknown module scope.');
  const selected = documentClosure(model, model.documents.filter(d => scope.includes(d.module) || documents.includes(d.id) || (includeSystem && !d.module)));
  const contracts = (model.manifest.exact_contracts || []).filter(c => scope.includes(c.module) || selected.documents.some(d => d.path === c.artifact || d.path === c.explanation));
  preload(model.root, [...selected.documents.map(d => d.path), ...contracts.flatMap(c => [c.source, c.artifact])], model.view);
  gaps.push(...selected.gaps);
  for (const d of selected.documents) {
    try {
      const bytes = readBytes(model.root, d.path, undefined, model.view); inspected.push(d.path);
      if (!d.review || digest(bytes) !== d.review.sha256) gaps.push({ document: d.id, reason: 'document review missing or stale' });
      if (d.status === 'gap') gaps.push({ document: d.id, reason: 'document explicitly marked as a gap' });
      if (d.gaps?.length) gaps.push({ document: d.id, reason: 'document has unresolved coverage gaps', details: d.gaps });
      if (d.sources?.length && (!d.review?.observation || d.review.observation.digest !== captureObservation(model.root, d.sources, model.view).digest)) gaps.push({ document: d.id, reason: 'document source observation missing or stale' });
    } catch (error) { errors.push(error.message); }
  }
  for (const m of model.modules.filter(m => scope.includes(m.id))) {
    if (m.status !== 'current' || m.gaps.length) gaps.push({ module: m.id, reason: 'module relationships or coverage need review', details: m.gaps });
    if (m.source_paths.length) try {
      if (m.observation?.digest !== captureObservation(model.root, m.source_paths, model.view).digest) gaps.push({ module: m.id, reason: 'source observation missing or stale' });
    } catch (error) { errors.push(error.message); }
  }
  for (const entity of [{ id: null, kinds: ['system'] }, ...model.modules.filter(m => scope.includes(m.id))]) {
    if (entity.id === null && !includeSystem) continue;
    const owned = selected.documents.filter(d => d.module === entity.id);
    for (const rule of model.policy.rules.filter(r => r.kinds.some(k => entity.kinds.includes(k)) && (!r.modules || r.modules.includes(entity.id)))) {
      for (const topic of rule.topics) if (!owned.some(d => d.topics.includes(topic)) && !entity.not_applicable?.some(e => e.topic === topic && e.reason?.trim())) gaps.push({ module: entity.id, reason: 'missing topic: ' + topic });
      if (rule.layout === 'separate-topics' && owned.some(d => d.topics.filter(t => rule.topics.includes(t)).length > 1)) gaps.push({ module: entity.id, reason: 'topics require separate owners' });
      const count = owned.filter(d => d.topics.some(t => rule.topics.includes(t))).length;
      if (count < (rule.min_files || 0) || count > (rule.max_files || Infinity)) gaps.push({ module: entity.id, reason: 'document count outside configured bounds' });
    }
  }
  const contractIds = new Set(), artifacts = new Set();
  for (const c of model.manifest.exact_contracts || []) {
    if (!ID.test(c.id || '') || contractIds.has(c.id) || artifacts.has(c.artifact) || !model.modules.some(m => m.id === c.module) ||
        !['json-schema', 'openapi-json'].includes(c.format) || !model.documents.some(d => d.path === c.artifact && d.status !== 'retired') || !model.documents.some(d => d.path === c.explanation && d.status !== 'retired') || sourceOwner(model, c.source) !== c.module ||
        model.documents.some(d => d.path === c.source) || c.source === c.artifact) { errors.push('Invalid exact contract: ' + c.id); continue; }
    contractIds.add(c.id); artifacts.add(c.artifact);
    if (!scope.includes(c.module) && !selected.documents.some(d => d.path === c.artifact || d.path === c.explanation)) continue;
    try {
      const result = compareContracts(inspectContract(readBytes(model.root, c.source, undefined, model.view).toString(), c.format), inspectContract(readBytes(model.root, c.artifact, undefined, model.view).toString(), c.format));
      if (result.status === 'mismatch') errors.push('Exact contract drift: ' + c.id);
      if (result.status === 'partial') gaps.push({ contract: c.id, reason: 'unresolved exact contract references' });
    } catch (error) { errors.push(error.message); }
  }
  const files = [];
  if (inventory) for (const file of listSnapshotFiles(model.root, model.view)) {
    const module = sourceOwner(model, file), excluded = model.policy.excludes.find(e => owns(e.path, file));
    const registered = model.metadata_paths.includes(file) || model.documents.some(d => d.path === file);
    if (!module && !excluded && !registered) gaps.push({ path: file, reason: 'unmapped maintained file' });
    files.push({ path: file, module, ...(excluded ? { excluded: excluded.reason } : {}) });
  }
  if (strict) errors.push(...gaps.map(g => (g.document || g.module || g.path || g.contract || 'knowledge') + ': ' + g.reason));
  return { errors, gaps, scope, inspected, files, coverage: gaps.length ? 'partial' : 'declared', semantic_assurance: 'not-proven-by-mechanical-check', inventory_complete: inventory };
}
export function createPublicationManifest(model, { modules = null, audience = null, sensitivities = ['public', 'internal'], previous = null, release = null } = {}) {
  if (!strings(sensitivities) || sensitivities.some(s => !['public', 'internal', 'restricted'].includes(s))) throw new Error('Unknown sensitivity selection.');
  const scope = modules?.length ? moduleClosure(model, modules).context : model.modules.map(m => m.id);
  const allowed = d => d && d.status !== 'retired' && (!audience || d.audience.includes(audience)) && sensitivities.includes(d.sensitivity);
  const selected = model.documents.filter(d => allowed(d) && (!d.module || scope.includes(d.module))), ids = new Set(selected.map(d => d.id));
  for (let i = 0; i < selected.length; i++) for (const id of selected[i].refs) { const d = model.documents.find(d => d.id === id); if (!ids.has(id) && allowed(d)) { selected.push(d); ids.add(id); } }
  const identity = value => JSON.stringify({ project: value.project, scope: value.scope?.slice().sort() || null, audience: value.audience, sensitivities: value.sensitivities?.slice().sort() });
  const selection = { project: model.config.project.id, scope: modules?.length ? [...modules].sort() : null, audience, sensitivities: [...sensitivities].sort(), release };
  if (previous && (previous.schema_version !== '1.0' || previous.structure !== 'accord-publication-manifest' || identity(previous.selection) !== identity(selection) || !Array.isArray(previous.documents))) throw new Error('Previous publication selection differs.');
  return { schema_version: '1.0', structure: 'accord-publication-manifest', selection, selected_modules: scope,
    modules: model.modules.filter(m => scope.includes(m.id) || selected.some(d => d.module === m.id)).map(m => ({ id: m.id, parent: m.parent, depends_on: m.depends_on, status: m.status, gaps: m.gaps, observation: m.observation || null })),
    observed_revision: headRevision(model.root), metadata_fingerprint: model.fingerprint,
    documents: selected.map(d => { const sha256 = digest(readBytes(model.root, d.path, undefined, model.view)); return { ...d, sha256, review_matches: d.review ? d.review.sha256 === sha256 : null, unresolved_context: d.refs.filter(id => !ids.has(id)) }; }),
    removed: previous ? previous.documents.filter(d => !ids.has(d.id)).map(d => ({ id: d.id, path: d.path })) : [],
    omitted: model.documents.filter(d => !ids.has(d.id)).map(d => ({ id: d.id, path: d.path, reason: 'retired, outside scope, audience or sensitivity' })),
    limitation: 'Publication metadata does not establish semantic completeness or deployed behavior. The consuming pipeline enforces permissions and context.' };
}
function main() {
  const opts = { project: '.', modules: [], documents: [] };
  try {
    for (let i = 2; i < process.argv.length; i++) {
      const a = process.argv[i];
      if (a === '--help') { console.log('accord-project.mjs --project DIR [--modules IDS] [--documents IDS] [--query TEXT] [--impact|--validate|--review|--publish] [--staged] [--audience NAME] [--previous FILE] [--release ID]'); return; }
      if (['--impact', '--validate', '--publish', '--review', '--staged'].includes(a)) opts[a.slice(2)] = true;
      else if (['--project', '--modules', '--documents', '--query', '--audience', '--previous', '--release'].includes(a) && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) { const value = process.argv[++i]; opts[a.slice(2)] = ['--modules', '--documents'].includes(a) ? value.split(',') : value; }
      else throw new Error('Unknown or incomplete option: ' + a);
    }
    const model = loadProjectModel(opts.project, null, null, { staged: !!opts.staged });
    const result = opts.publish ? createPublicationManifest(model, { ...opts, previous: opts.previous ? readJson(opts.project, opts.previous) : null }) : opts.review ? reviewKnowledge(model, opts) : opts.validate ? validateProjectKnowledge(model, { ...opts, modules: opts.modules.length ? opts.modules : null }) : selectProjectContext(model, opts);
    console.log(JSON.stringify(result, null, 2)); if (result.errors?.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
