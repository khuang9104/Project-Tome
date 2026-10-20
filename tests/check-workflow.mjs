import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = fs.existsSync(path.join(root, 'payload')) ? root : path.join(root, 'Project-Tome');
const scripts = process.argv[2] || path.join(root, fs.existsSync(path.join(root, 'payload')) ? 'payload/.agents/skills/tome/scripts' : '.agents/skills/tome/scripts');
const load = name => import(pathToFileURL(path.join(scripts, name + '.mjs')));
const { loadProjectModel, reviewKnowledge, selectProjectContext, validateProjectKnowledge, digest, createPublicationManifest } = await load('tome-project');
const { inspectCommit, validateProject, verifyConfiguration } = await load('tome-validate');
const { captureObservation, readSnapshotFile, stagedChanges, sourcePath } = await load('tome-scope');
const { verifyReleasePackage, installationTarget, createInstallationRecord, inspectInstallation, planAdoption, mergeManagedEntry, mergeJson } = await load('tome-adoption');
const { parseExactJson, inspectContract, compareContracts } = await load('tome-contracts');
const { configureHook } = await load('tome-hook');
const { exportKnowledgeDelivery, verifyKnowledgeDelivery, sourceFreePathViolation } = await load('tome-knowledge-export');
const area = fs.mkdtempSync(path.join(os.tmpdir(), 'tome-knowledge-test-'));
const project = path.join(area, 'project'); fs.mkdirSync(project);
let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('PASS ' + label); };
const write = (file, data) => { const target = path.join(project, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n'); };
const json = file => JSON.parse(fs.readFileSync(path.join(project, file)));
const git = (...args) => execFileSync('git', args, { cwd: project, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const stage = () => git('add', '--all');
const doc = (id, file, topics, extra = {}) => ({ id, path: file, topics, refs: [], requirements: [], audience: ['development'], sensitivity: 'internal', status: 'observed', ...extra });
function refresh(modules, documents = []) {
  stage();
  const model = loadProjectModel(project, null, null, { staged: true });
  const review = reviewKnowledge(model, { modules, documents });
  const manifest = json('docs/manifest.yaml');
  for (const d of review.document_reviews) {
    const owner = model.documents.find(x => x.id === d.id);
    const target = owner.module ? json(model.modules.find(m => m.id === owner.module).metadata_path) : manifest;
    const entry = target.documents.find(x => x.id === d.id);
    entry.review = { sha256: d.sha256, basis: 'Read needs and code; verified current method/field meanings.', ...(d.observation ? { observation: d.observation } : {}) };
    if (owner.module) write(model.modules.find(m => m.id === owner.module).metadata_path, target);
  }
  for (const m of review.module_observations) { const file = model.modules.find(x => x.id === m.id).metadata_path, target = json(file); target.observation = m.observation; write(file, target); }
  write('docs/manifest.yaml', manifest); stage();
}
try {
  git('init', '--quiet'); git('config', 'user.name', 'Project Tome Fixture'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'core.autocrlf', 'false');
  write('src/orders.js', 'export function submitOrder(status) { return status; }\n');
  write('legacy/old.js', 'export const legacy = true;\n'); stage(); git('commit', '--quiet', '-m', 'existing project');
  const release = verifyReleasePackage(pkg);
  for (const entry of release.files.filter(e => e.source_path.startsWith('payload/'))) {
    const target = installationTarget(entry.source_path); write(target.path, fs.readFileSync(path.join(pkg, entry.source_path)).toString('utf8'));
  }
  const config = json('.tome/tome.yaml'); config.project = { id: 'fixture', name: 'Orders' }; write('.tome/tome.yaml', config);
  const manifest = json('docs/manifest.yaml');
  for (const d of manifest.documents) write(d.path, '# ' + d.id + '\n\nConfirmed decision: Keep original order rules. Open question: legacy module details.\n');
  manifest.module_files = ['docs/modules/orders/module.yaml', 'docs/modules/legacy/module.yaml'];
  const orderDoc = doc('ORDER-API', 'docs/modules/orders.md', ['responsibility', 'contracts', 'source-map'], { aliases: ['订单'], refs: ['DOC-SYSTEM'] });
  write(orderDoc.path, '# Orders\n\nsubmitOrder(status: pending | paid): string. pending means awaiting payment.\nSource: src/orders.js. Preserve order rules.\n');
  write(manifest.module_files[0], { id: 'orders', parent: null, kinds: ['module'], source_paths: ['src'], depends_on: [], status: 'current', gaps: [], documents: [orderDoc] });
  write(manifest.module_files[1], { id: 'legacy', parent: null, kinds: ['module'], source_paths: ['legacy'], depends_on: ['orders'], status: 'draft', gaps: ['Methods not yet explained'], documents: [] });
  write('docs/manifest.yaml', manifest);
  const sourceRevision = execFileSync('git', ['-C', pkg, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  write('.tome/installation.json', createInstallationRecord(project, pkg, { repository: release.release.source_repository, revision: sourceRevision, worktree: 'dirty' }));
  refresh(['orders'], manifest.documents.map(d => d.id));
  check('progressive adoption keeps unrelated indexed historical gaps', () => { const r = inspectCommit(project); assert.equal(r.status, 'ready', r.errors.join('\n')); assert(r.historical_gaps.some(g => g.module === 'legacy')); });
  check('installation works without governance, work, V&V or capabilities', () => assert.deepEqual(inspectInstallation(project, config).errors, []));
  check('previous source identities are rejected without rewriting project records', () => {
    const record = json('.tome/installation.json');
    for (const repository of ['https://github.com/khuang9104/Agentic-Accord', 'https://github.com/khuang9104/Agentic-Coding-Accord']) {
      write('.tome/installation.json', { ...record, source: { ...record.source, repository } });
      assert(inspectInstallation(project, config).errors.length > 0);
      assert.throws(() => planAdoption(project, pkg), /requires reconciliation/);
      assert.equal(json('.tome/installation.json').source.repository, repository);
    }
    write('.tome/installation.json', record);
  });
  check('audit distinguishes partial historical coverage from errors', () => { const r = validateProject(project); assert.equal(r.status, 'partial'); assert.deepEqual(r.errors, []); });
  check('fresh Agent finds durable intent and method parameter meaning', () => { const m = loadProjectModel(project), r = selectProjectContext(m, { query: 'submitOrder' }); assert(r.documents.some(d => d.id === 'ORDER-API' && d.match.field === 'content')); assert(r.documents.some(d => d.id === 'DOC-SYSTEM')); assert(r.documents.some(d => d.id === 'DOC-CONTEXT')); assert(selectProjectContext(m, { query: '订单' }).documents.some(d => d.id === 'ORDER-API')); });
  git('commit', '--quiet', '-m', 'adopt knowledge');
  check('stale affected source blocks commit and reports consumer candidates', () => { write('src/orders.js', 'export function submitOrder(status, amount) { return amount; }\n'); stage(); const r = inspectCommit(project); assert.equal(r.status, 'blocked'); assert(r.errors.some(e => e.includes('source observation'))); assert.deepEqual(r.consumer_candidates, ['legacy']); });
  refresh(['orders']);
  check('partial staging validates index, ignoring later worktree changes', () => { write('src/orders.js', 'export function submitOrder(status, amount, currency) { return currency; }\n'); assert.equal(inspectCommit(project).status, 'ready'); assert.notEqual(captureObservation(project, ['src']).digest, captureObservation(project, ['src'], { staged: true }).digest); });
  check('an explicitly affected historical consumer must now be completed', () => assert.equal(inspectCommit(project, { modules: ['legacy'] }).status, 'blocked'));
  check('a doc-only change needs fresh semantic review', () => { write(orderDoc.path, '# Orders\n\nsubmitOrder(status, amount) returns amount; validated nonnegative.\n'); stage(); assert.equal(inspectCommit(project).status, 'blocked'); });
  refresh(['orders']);
  check('reviewed affected knowledge permits commit without filling unrelated gaps', () => assert.equal(inspectCommit(project).status, 'ready'));
  check('actual Git hook blocks stale source and allows reconciled commit', () => {
    configureHook(project, { install: true });
    write('src/orders.js', 'export function submitOrder(status, amount) { return Math.max(amount, 0); }\n'); stage();
    let r = spawnSync('git', ['commit', '-m', 'must block'], { cwd: project, encoding: 'utf8' }); assert.notEqual(r.status, 0); assert.match(r.stdout + r.stderr, /blocked|stale/);
    refresh(['orders']); r = spawnSync('git', ['commit', '-m', 'reconciled'], { cwd: project, encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr);
  });
  check('hook installer preserves existing hook configuration', () => { git('config', 'core.hooksPath', 'custom-hooks'); assert.throws(() => configureHook(project, { install: true }), /Existing/); git('config', 'core.hooksPath', '.tome/hooks'); });
  check('shared database document follows repository schema without live access', () => {
    write('src/schema.json', { type: 'object', properties: { status: { type: 'string', enum: ['pending', 'paid'] } } });
    const mf = json('docs/manifest.yaml'); mf.documents.push(doc('DB', 'docs/database.md', ['database', 'contracts'], { sources: ['src/schema.json'] })); write('docs/database.md', '# Database\n\norders.status: pending = awaiting payment, paid = settled. Code-defined only; no deployment observation.\n'); write('docs/manifest.yaml', mf);
    refresh(['orders'], ['DB']); assert.equal(inspectCommit(project).status, 'ready');
    const db = json('src/schema.json'); db.properties.status.enum.push('refunded'); write('src/schema.json', db); stage(); assert.equal(inspectCommit(project).status, 'blocked');
  });
  check('exact contract catches enum drift even after freshness metadata updates', () => {
    write('docs/schema.json', json('src/schema.json'));
    const mf = json('docs/manifest.yaml'); mf.documents.push(doc('DB-EXACT', 'docs/schema.json', ['exact-contract'])); mf.exact_contracts = [{ id: 'orders-schema', module: 'orders', source: 'src/schema.json', artifact: 'docs/schema.json', explanation: 'docs/database.md', format: 'json-schema' }]; write('docs/manifest.yaml', mf);
    refresh(['orders'], ['DB', 'DB-EXACT']); assert.equal(inspectCommit(project).status, 'ready');
    const db = json('src/schema.json'); db.properties.status.enum.push('cancelled'); write('src/schema.json', db); refresh(['orders'], ['DB']); const r = inspectCommit(project); assert(r.errors.some(e => e.includes('Exact contract drift')));
    write('docs/schema.json', db); refresh(['orders'], ['DB-EXACT']); assert.equal(inspectCommit(project).status, 'ready');
  });
  check('changed unmapped source cannot silently pass', () => { write('unmapped/new.js', 'export const value=1;\n'); stage(); assert(inspectCommit(project).errors.some(e => e.includes('unmapped/new.js'))); fs.unlinkSync(path.join(project, 'unmapped/new.js')); stage(); });
  check('rename and deletion change source observation', () => { git('mv', 'src/orders.js', 'src/order-service.js'); assert.equal(inspectCommit(project).status, 'blocked'); refresh(['orders']); assert.equal(inspectCommit(project).status, 'ready'); fs.unlinkSync(path.join(project, 'src/order-service.js')); stage(); assert.equal(inspectCommit(project).status, 'blocked'); refresh(['orders']); assert.equal(inspectCommit(project).status, 'ready'); });
  check('missing references, cycles and declared gaps remain visible', () => {
    const m = loadProjectModel(project); m.documents.find(d => d.id === 'ORDER-API').refs.push('MISSING'); assert(validateProjectKnowledge(m).gaps.some(g => g.reference === 'MISSING'));
    m.documents.find(d => d.id === 'ORDER-API').status = 'gap'; assert(validateProjectKnowledge(m, { modules: ['orders'], strict: true }).errors.some(e => e.includes('explicitly marked')));
    assert.throws(() => reviewKnowledge(m, { modules: ['unknown'] }), /registered modules/);
    assert(selectProjectContext(m, { query: 'legacy' }).modules.some(x => x.id === 'legacy' && x.status === 'draft'));
    const descriptor = json('docs/modules/orders/module.yaml'); write('docs/modules/orders/module.yaml', { ...descriptor, parent: 'orders' }); assert.throws(() => loadProjectModel(project), /cycle/); write('docs/modules/orders/module.yaml', descriptor);
  });
  check('old configuration and receipt schemas are unsupported', () => {
    assert(verifyConfiguration({ ...config, schema_version: '0.10' }).length > 0);
    assert(verifyConfiguration({ ...config, tome: undefined, accord: config.tome }).length > 0);
    const record = json('.tome/installation.json');
    write('.tome/installation.json', { ...record, schema_version: '1.0' });
    assert(inspectInstallation(project, config).errors.length > 0);
    write('.tome/installation.json', record);
    const manifest = json('docs/manifest.yaml');
    write('docs/manifest.yaml', { ...manifest, schema_version: '1.4' });
    assert.throws(() => loadProjectModel(project), /knowledge/i);
    write('docs/manifest.yaml', manifest);
  });
  check('explicit delivery copies knowledge, omits source and verifies integrity', () => { const output = path.join(area, 'delivery'); exportKnowledgeDelivery({ projectRoot: project, outputRoot: output, manifest: json('docs/manifest.yaml'), config }); assert.equal(fs.existsSync(path.join(output, 'src')), false); const r = verifyKnowledgeDelivery(output); assert(r.files > 0); fs.appendFileSync(path.join(output, 'docs/database.md'), 'tampered'); assert.throws(() => verifyKnowledgeDelivery(output), /integrity/); assert(sourceFreePathViolation('src/orders.js')); });
  check('publication selection identity cannot silently change', () => { const m = loadProjectModel(project), p = createPublicationManifest(m, { modules: ['orders'] }); assert.throws(() => createPublicationManifest(m, { modules: ['legacy'], previous: p }), /selection/); });
  check('exact parser rejects duplicate keys and lossy numbers', () => { assert.throws(() => parseExactJson('{"x":1,"x":2}')); assert.throws(() => parseExactJson('{"x":9007199254740993}')); assert.equal(compareContracts(inspectContract('{"enum":[1,2]}', 'json-schema'), inspectContract('{"enum":[1]}', 'json-schema')).status, 'mismatch'); });
  check('literal paths do not expand Git pathspecs or escape the project', () => { assert.throws(() => sourcePath('../outside')); assert.throws(() => sourcePath('C:/outside')); assert.throws(() => readSnapshotFile(project, 'src/*', { staged: true })); });
  check('adoption preserves user text and conflicts instead of overwriting', () => { assert.match(mergeManagedEntry('User rules\n', '<!-- tome:begin version="1.0" -->\nKnowledge\n<!-- tome:end -->').content, /^User rules/); assert.deepEqual(mergeJson({ x: 1 }, { x: 2 }, { x: 3 }).conflicts, ['/x']); const p = planAdoption(project, pkg); assert(p.actions.some(a => a.action === 'preserve-project')); assert.equal(p.writes_performed, false); });
  check('runtime tampering is reported by installation validation', () => { fs.appendFileSync(path.join(project, '.agents/skills/tome/SKILL.md'), '\ncustom'); assert(inspectInstallation(project, config).errors.some(e => e.includes('drift'))); });
  check('initial commit uses index without inventing a previous revision', () => {
    const initial = path.join(area, 'initial'); fs.mkdirSync(initial);
    const run = (...args) => execFileSync('git', args, { cwd: initial, encoding: 'utf8' }).trim();
    const put = (file, data) => { const target = path.join(initial, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, typeof data === 'string' ? data : JSON.stringify(data)); };
    run('init', '--quiet'); run('config', 'core.autocrlf', 'false');
    put('.tome/tome.yaml', config); put('.tome/documentation-policy.yaml', { schema_version: '1.0', rules: [], excludes: [{ path: '.tome', reason: 'metadata' }] });
    put('docs/manifest.yaml', { schema_version: '2.0', structure: 'tome-project-knowledge', knowledge_root: 'docs', status: 'current', module_files: [], documents: [doc('INITIAL', 'docs/intent.md', ['needs'], { review: { sha256: digest('# Original goal\n'), basis: 'Read original user goal.' } })] });
    put('docs/intent.md', '# Original goal\n'); run('add', '--all');
    const r = inspectCommit(initial); assert.equal(r.base_revision, null); assert.equal(r.status, 'ready', r.errors.join('\n'));
    put('docs/intent.md', 'unstaged goal'); assert.equal(inspectCommit(initial).status, 'ready');
  });
  check('unmerged and symlink index entries never fall back to local bytes', () => {
    const initial = path.join(area, 'initial');
    const object = spawnSync('git', ['hash-object', '-w', '--stdin'], { cwd: initial, encoding: 'utf8', input: 'target\n' }).stdout.trim();
    execFileSync('git', ['update-index', '--add', '--cacheinfo', '120000,' + object + ',linked'], { cwd: initial });
    assert.throws(() => readSnapshotFile(initial, 'linked', { staged: true }), /non-regular/);
    execFileSync('git', ['update-index', '--index-info'], { cwd: initial, input: '100644 ' + object + ' 1\tconflict\n100644 ' + object + ' 2\tconflict\n' });
    assert.throws(() => stagedChanges(initial), /unmerged/);
  });
  console.log(passed + ' workflow scenarios passed.');
} finally {
  const resolved = fs.realpathSync(area);
  if (path.dirname(resolved).toLowerCase() !== fs.realpathSync(os.tmpdir()).toLowerCase() || !path.basename(resolved).startsWith('tome-knowledge-test-')) throw new Error('Unsafe fixture cleanup path.');
  fs.rmSync(resolved, { recursive: true, force: true });
}
