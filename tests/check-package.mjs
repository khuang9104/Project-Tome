import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = fs.existsSync(path.join(root, 'payload')) ? root : path.join(root, 'Project-Tome');
const scripts = path.join(root, fs.existsSync(path.join(root, 'payload')) ? 'payload/.agents/skills/accord/scripts' : '.agents/skills/accord/scripts');
const { verifyReleasePackage, installationTarget } = await import(pathToFileURL(path.join(scripts, 'accord-adoption.mjs')));
const { replaceGeneratedArtifacts } = await import(pathToFileURL(path.join(root, 'scripts/release-transaction.mjs')));
const area = fs.mkdtempSync(path.join(os.tmpdir(), 'accord-package-test-'));
let count = 0;
const check = (label, fn) => { fn(); count++; console.log('PASS ' + label); };
function clone(name) { const dir = path.join(area, name); fs.mkdirSync(dir); for (const f of ['payload', 'RELEASE.json', 'SHA256SUMS']) fs.cpSync(path.join(pkg, f), path.join(dir, f), { recursive: true }); return dir; }
try {
  const clean = clone('clean');
  check('fresh clone verifies without an untracked empty vendor directory', () => assert.equal(verifyReleasePackage(clean).config.schema_version, '1.0'));
  check('both previous brands are import-only with exact ID and repository pairs', () => {
    for (const [id, repository] of [
      ['agentic-accord', 'https://github.com/khuang9104/Agentic-Accord'],
      ['agentic-coding-accord', 'https://github.com/khuang9104/Agentic-Coding-Accord']
    ]) {
      const dir = clone(id);
      const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'RELEASE.json')));
      const updateIdentity = (nextId, nextRepository) => {
        metadata.id = nextId; metadata.source_repository = nextRepository;
        for (const file of ['RELEASE.json', 'payload/.accord/release.json']) fs.writeFileSync(path.join(dir, file), JSON.stringify(metadata, null, 2) + '\n');
        const sums = path.join(dir, 'SHA256SUMS');
        fs.writeFileSync(sums, fs.readFileSync(sums, 'utf8').split('\n').filter(Boolean).map(line => { const file = line.slice(66); return crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, file))).digest('hex') + '  ' + file; }).join('\n') + '\n');
      };
      updateIdentity(id, repository);
      assert.throws(() => verifyReleasePackage(dir), /Release metadata/);
      assert.equal(verifyReleasePackage(dir, { migrationSource: true }).release.id, id);
      updateIdentity('project-tome', repository);
      assert.throws(() => verifyReleasePackage(dir, { migrationSource: true }), /Release metadata/);
      updateIdentity(id, 'https://github.com/khuang9104/Project-Tome');
      assert.throws(() => verifyReleasePackage(dir, { migrationSource: true }), /Release metadata/);
    }
  });
  check('payload includes no retired control directories or scripts', () => { const p = verifyReleasePackage(clean); assert(!p.files.some(f => /accord-(?:vv|work|governance|route|methods|capability-bundle)\.mjs|\.accord\/(?:capabilities|governance)/.test(f.source_path))); assert(p.files.some(f => f.source_path.endsWith('hooks/pre-commit'))); });
  check('modified payload bytes fail checksum validation', () => { const dir = clone('tampered'); fs.appendFileSync(path.join(dir, 'payload/.agents/skills/accord/SKILL.md'), '\nchanged'); assert.throws(() => verifyReleasePackage(dir), /checksum/); });
  check('unlisted payload and duplicate manifest entries are rejected', () => { const dir = clone('extra'); fs.writeFileSync(path.join(dir, 'payload/docs/extra.md'), 'extra'); assert.throws(() => verifyReleasePackage(dir), /unlisted/); fs.unlinkSync(path.join(dir, 'payload/docs/extra.md')); const mf = path.join(dir, 'SHA256SUMS'); fs.appendFileSync(mf, fs.readFileSync(mf, 'utf8').split('\n')[0] + '\n'); assert.throws(() => verifyReleasePackage(dir), /Duplicate/); });
  check('unsafe and retired installation targets are rejected', () => { for (const p of ['payload/../outside', 'payload/.git/config', 'payload/.accord/governance.yaml', 'payload/.accord/capabilities/registry.yaml']) assert.throws(() => installationTarget(p)); assert.equal(installationTarget('payload/.accord/governance.yaml', { migrationSource: true }).policy, 'merge-json'); });
  check('linked package files are refused', () => { const dir = clone('hardlink'), file = path.join(dir, 'payload/docs/README.md'), copy = path.join(area, 'external.md'); fs.copyFileSync(file, copy); fs.unlinkSync(file); fs.linkSync(copy, file); assert.throws(() => verifyReleasePackage(dir), /Hard-linked/); });
  check('transaction failure restores every generated artifact', () => {
    const release = path.join(area, 'release'); fs.mkdirSync(release); const stage = fs.mkdtempSync(path.join(release, '.accord-release-build-'));
    for (const name of ['payload', 'vendor', 'RELEASE.json', 'SHA256SUMS']) { fs.writeFileSync(path.join(release, name), 'before'); fs.writeFileSync(path.join(stage, name), 'after'); }
    let moves = 0; const faulty = { ...fs, renameSync: (...args) => { if (++moves === 4) throw new Error('simulated move failure'); fs.renameSync(...args); } };
    assert.throws(() => replaceGeneratedArtifacts(release, stage, faulty), /simulated/);
    for (const name of ['payload', 'vendor', 'RELEASE.json', 'SHA256SUMS']) assert.equal(fs.readFileSync(path.join(release, name), 'utf8'), 'before');
  });
  check('transaction refuses a staging directory outside its exact release root', () => { assert.throws(() => replaceGeneratedArtifacts(clean, area), /dedicated direct child/); });
  console.log(count + ' package scenarios passed.');
} finally {
  const resolved = fs.realpathSync(area);
  if (path.dirname(resolved).toLowerCase() !== fs.realpathSync(os.tmpdir()).toLowerCase() || !path.basename(resolved).startsWith('accord-package-test-')) throw new Error('Unsafe cleanup');
  fs.rmSync(resolved, { recursive: true, force: true });
}
