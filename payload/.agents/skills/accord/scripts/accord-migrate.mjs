#!/usr/bin/env node
// One-way import only. Retired schemas are never accepted by current runtime.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ID, strings, digest, readJson, relativePath } from './accord-project.mjs';
import { RETIRED_CONFIG_FIELDS, PROTOCOL_VERSION } from './accord-protocol.mjs';

// Read-only migration proposal: retains files/IDs and never upgrades evidence.
function planLegacyMigration(root, config = readJson(root, '.accord/accord.yaml'), old = readJson(root, 'docs/manifest.yaml')) {
  if (!['1.2', '1.3', '1.4'].includes(old.schema_version) || !strings(old.modules) || !strings(old.documents)) throw new Error('Migration requires a recognized legacy knowledge registry.');
  const collisions = [], declarations = [], docs = new Map();
  const make = (file, topics, id = 'DOC-' + digest(file).slice(0, 16)) => ({ id, path: file, topics, refs: [], requirements: [],
    audience: file === 'docs/agent-context.md' ? ['agent'] : ['development', 'operations'], status: 'draft', sensitivity: 'internal' });
  const add = (file, topics, id, module = null) => {
    relativePath(file);
    if (docs.has(file)) {
      const existing = docs.get(file); existing.topics = [...new Set([...existing.topics, ...topics])];
      if (id && existing.id !== id && existing.id !== 'DOC-' + digest(file).slice(0, 16)) collisions.push('Competing existing IDs for owner: ' + file);
      if (id) existing.id = id;
      return existing;
    }
    const d = { ...make(file, topics, id), module }; docs.set(file, d); return d;
  };
  for (const file of old.documents) add('docs/' + file, [file.includes('architecture') ? 'architecture' : file.includes('system-overview') ? 'needs' : 'reference']);
  for (const module of old.modules) {
    if (!ID.test(module)) throw new Error('Invalid legacy module ID.');
    add('docs/modules/' + module + '.md', ['responsibility', 'contracts', 'source-map'], undefined, module);
    const scope = old.scopes?.find(s => s.module === module);
    const file = 'docs/modules/' + module + '/module.yaml';
    if (fs.existsSync(path.join(root, file))) collisions.push(file);
    declarations.push({ path: file, content: { id: module, parent: null, kinds: ['module'],
      source_paths: scope?.sources || [], depends_on: scope?.depends_on || [], status: 'draft',
      gaps: ['Review migrated metadata and required semantic topics; no prior approval inferred.'], documents: [] } });
  }
  for (const d of old.engineering?.documents || []) add(d.path, [d.kind], undefined, d.module);
  for (const c of old.engineering?.contracts || []) add(c.artifact, ['exact-contract'], undefined, c.module);
  const sharedOwners = [];
  for (const owner of config.sources?.engineering || []) {
    const d = add(owner.path, owner.kinds, owner.id, owner.modules?.length === 1 ? owner.modules[0] : null);
    if (owner.modules?.length) sharedOwners.push({ id: d.id, modules: owner.modules });
  }
  for (const d of docs.values()) {
    if (!fs.existsSync(path.join(root, d.path))) collisions.push('Missing owner: ' + d.path);
    const descriptor = declarations.find(m => m.content.id === d.module);
    if (d.module && !descriptor) collisions.push('Unknown owner module: ' + d.module);
    if (descriptor) { const { module, ...entry } = d; descriptor.content.documents.push(entry); }
  }
  // Shared inputs retain one owner; module entry documents point to it for routing.
  for (const owner of sharedOwners) for (const id of owner.modules) {
    const entry = declarations.find(m => m.content.id === id)?.content.documents[0];
    if (!entry) collisions.push('Missing module for shared input: ' + id);
    else if (entry.id !== owner.id && !entry.refs.includes(owner.id)) entry.refs.push(owner.id);
  }
  if (new Set([...docs.values()].map(d => d.id)).size !== docs.size) collisions.push('Duplicate migrated document identity.');
  return { schema_version: '1.0', mode: 'proposal-only', collisions, module_declarations: declarations,
    manifest: { schema_version: '2.0', structure: 'accord-project-knowledge', knowledge_root: 'docs', status: 'draft',
      module_files: declarations.map(m => m.path), documents: [...docs.values()].filter(d => !d.module).map(({ module, ...d }) => d),
      exact_contracts: old.engineering?.contracts || [] },
    instruction: 'Resolve collisions, merge reviewed policies/config/runtime from the chosen release, preserve original evidence in Git, and apply the registry and config together. No source files, history or approvals have been changed.' };
}

export function planKnowledgeMigration(root, config = readJson(root, '.accord/accord.yaml'), old = readJson(root, config.knowledge_base?.manifest || 'docs/manifest.yaml')) {
  if (!['0.8', '0.9', '0.10', '1.0'].includes(config.schema_version)) throw new Error('Unsupported configuration migration.');
  const imported = old.schema_version === '2.0' ? { manifest: structuredClone(old), module_declarations: old.module_files.map(file => ({ path: file, content: readJson(root, file) })), collisions: [] } : planLegacyMigration(root, config, old);
  const next = structuredClone(config);
  const removed = RETIRED_CONFIG_FIELDS;
  for (const key of removed) delete next[key];
  delete next.sources?.engineering;
  next.schema_version = '1.0'; next.accord.version = next.accord.release = PROTOCOL_VERSION;
  next.knowledge_base.structure_version = '2.0'; next.knowledge_base.refresh_policy = 'change-impact';
  return { schema_version: '1.0', mode: 'proposal-only', writes_performed: false, configuration: next,
    manifest: imported.manifest, module_declarations: imported.module_declarations, collisions: imported.collisions,
    retired_configuration: removed.filter(k => config[k] !== undefined),
    inspect_before_retirement: ['.accord/work', '.accord/changes', '.accord/records', '.accord/governance.yaml', '.accord/capabilities'],
    gaps: ['Reconcile durable user needs and decisions from legacy records into canonical project memory.', 'Replace obsolete documentation policy topics; preserve local coverage rules.', 'Merge current runtime and entry blocks using the adoption plan, then update provenance and activate/integrate the hook if requested.'],
    instruction: 'Preserve existing document IDs, paths, refs and evidence. No original files were changed. No old review is promoted to semantic approval. Unrelated user Skills stay under native project rules.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === '--help') console.log('accord-migrate.mjs --project DIR: print a read-only knowledge/configuration migration proposal.');
    else { if (args.length !== 2 || args[0] !== '--project') throw new Error('Expected --project DIR.'); console.log(JSON.stringify(planKnowledgeMigration(args[1]), null, 2)); }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
