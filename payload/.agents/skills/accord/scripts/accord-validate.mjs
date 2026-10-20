#!/usr/bin/env node
// Read-only validation. Never executes project code or tests.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectInstallation } from './accord-adoption.mjs';
import { CONFIG_SCHEMA, PROTOCOL_VERSION, KNOWLEDGE_SCHEMA, RETIRED_CONFIG_FIELDS, VALIDATION_SCOPES } from './accord-protocol.mjs';
import { loadProjectModel, validateProjectKnowledge, readJson, relativePath, owns, sourceOwner, moduleClosure, strings } from './accord-project.mjs';
import { stagedChanges } from './accord-scope.mjs';

export function verifyConfiguration(config, errors = []) {
  if (config?.schema_version !== CONFIG_SCHEMA) errors.push('Migrate configuration to schema ' + CONFIG_SCHEMA + '.');
  if (config?.accord?.version !== PROTOCOL_VERSION) errors.push('Expected accord.version ' + PROTOCOL_VERSION + '.');
  if (!/^\d+\.\d+\.\d+$/.test(config?.accord?.release || '')) errors.push('Expected a semantic release version.');
  if (typeof config?.project?.id !== 'string' || !config.project.id.trim()) errors.push('Project identity is required.');
  if (config?.repository?.vcs !== 'git' || config.repository.offline_capable !== true) errors.push('Project Tome requires local Git and offline operation.');
  if (config?.knowledge_base?.structure_version !== KNOWLEDGE_SCHEMA || config.knowledge_base.refresh_policy !== 'change-impact') errors.push('Knowledge requires schema 2.0 and change-impact maintenance.');
  for (const field of RETIRED_CONFIG_FIELDS) if (config?.[field] !== undefined) errors.push('Retired configuration: ' + field);
  try { relativePath(config.knowledge_base.manifest); relativePath(config.knowledge_base.root); if (config.documentation?.policy) relativePath(config.documentation.policy); }
  catch (error) { errors.push(error.message); }
  return errors;
}
export function inspectCommit(root, { modules = [] } = {}) {
  if (!strings(modules)) throw new Error('Modules must be distinct IDs.');
  const before = stagedChanges(root), view = { staged: true };
  const config = readJson(root, '.accord/accord.yaml', view), errors = verifyConfiguration(config);
  if (errors.length) return { errors, gaps: [], status: 'blocked' };
  const model = loadProjectModel(root, config, null, view), direct = new Set(), documents = new Set(), unmapped = [];
  for (const change of before.changes) for (const file of [...new Set([change.before, change.path].filter(Boolean))]) {
    const owner = sourceOwner(model, file);
    if (owner && model.modules.find(m => m.id === owner)?.source_paths.some(p => owns(p, file))) direct.add(owner);
    for (const m of model.modules) if (m.metadata_path === file && m.status === 'current') direct.add(m.id);
    for (const d of model.documents) if (d.status !== 'retired' && (d.path === file || d.sources?.some(p => owns(p, file)))) {
      if (!d.module || model.modules.find(m => m.id === d.module)?.status === 'current' || direct.has(d.module)) {
        documents.add(d.id); if (d.module) direct.add(d.module);
      }
    }
    if (!owner && !model.metadata_paths.includes(file) && !model.documents.some(d => d.path === file) && !model.policy.excludes.some(e => owns(e.path, file))) unmapped.push(file);
  }
  // Compare declarations as well as files, preventing stale review refreshes in metadata.
  if (before.base_revision) {
    let previous;
    try { previous = loadProjectModel(root, null, null, { revision: before.base_revision }); } catch { /* First migration uses the new registry. */ }
    if (previous) {
      for (const d of model.documents) if (d.status !== 'retired' && (!d.module || model.modules.find(m => m.id === d.module)?.status === 'current' || direct.has(d.module)) && JSON.stringify(previous.documents.find(p => p.id === d.id)) !== JSON.stringify(d)) { documents.add(d.id); if (d.module) direct.add(d.module); }
      for (const m of model.modules) if (m.status === 'current' && JSON.stringify(previous.modules.find(p => p.id === m.id)) !== JSON.stringify(m)) direct.add(m.id);
    }
  }
  const selected = [...new Set([...direct, ...modules])].sort();
  const checked = validateProjectKnowledge(model, { modules: selected, documents: [...documents], inventory: false, strict: true, includeSystem: false, dependencies: false });
  errors.push(...checked.errors, ...[...new Set(unmapped)].map(p => 'Changed maintained file has no knowledge owner or explicit exclusion: ' + p));
  const candidates = direct.size ? moduleClosure(model, [...direct], true).affected.filter(id => !selected.includes(id)) : [];
  const after = stagedChanges(root);
  if (after.index_fingerprint !== before.index_fingerprint || after.base_revision !== before.base_revision) errors.push('Git index or HEAD changed during inspection; repeat the check.');
  return { schema_version: '1.0', status: errors.length ? 'blocked' : 'ready', errors, gaps: checked.gaps,
    base_revision: before.base_revision, index_fingerprint: before.index_fingerprint, changes: before.changes,
    affected_modules: selected, documents: [...documents].sort(), consumer_candidates: candidates,
    historical_gaps: model.modules.filter(m => !selected.includes(m.id) && (m.status !== 'current' || m.gaps.length)).map(m => ({ module: m.id, gaps: m.gaps })),
    checked: ['staged snapshot', 'affected knowledge reviews', 'source observations', 'registered exact contracts'],
    limitation: 'Agent must inspect actual consumers, dynamic boundaries and document meaning. Add affected consumers with --modules. Hashes establish freshness, not semantic completeness; tests are chosen by the Agent/project.' };
}
export function validateProject(root, options = {}) {
  const scope = options.scope || 'audit';
  if (!VALIDATION_SCOPES.has(scope)) throw new Error('Unknown validation scope: ' + scope);
  if (scope === 'commit') return inspectCommit(root, options);
  const config = readJson(root, '.accord/accord.yaml'), errors = verifyConfiguration(config), warnings = [];
  if (errors.length) return { status: 'blocked', errors, warnings };
  if (scope === 'installation' || scope === 'audit') { const r = inspectInstallation(root, config); errors.push(...r.errors); warnings.push(...r.warnings); }
  let knowledge;
  if (scope !== 'installation') { knowledge = validateProjectKnowledge(loadProjectModel(root, config), { modules: options.modules?.length ? options.modules : null }); errors.push(...knowledge.errors); }
  return { schema_version: '1.0', scope, status: errors.length ? 'blocked' : knowledge?.gaps.length ? 'partial' : 'valid', errors, warnings, ...(knowledge ? { knowledge } : {}),
    limitation: 'Mechanical validation does not establish semantic completeness, test adequacy or deployed behavior.' };
}
function main() {
  const options = { project: '.', scope: 'audit', modules: [] };
  try {
    for (let i = 2; i < process.argv.length; i++) {
      const a = process.argv[i];
      if (a === '--help') { console.log('accord-validate.mjs --project DIR --scope installation|knowledge|commit|audit [--modules IDS]'); return; }
      if (!['--project', '--scope', '--modules'].includes(a) || !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error('Unknown or incomplete option: ' + a);
      const value = process.argv[++i]; options[a.slice(2)] = a === '--modules' ? value.split(',') : value;
    }
    const result = validateProject(path.resolve(options.project), options); console.log(JSON.stringify(result, null, 2)); if (result.errors.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
