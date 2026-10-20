#!/usr/bin/env node
// Read-only source views. Staged observations never fall back to worktree bytes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const normalized = bytes => {
  const text = bytes.toString('utf8');
  return !bytes.includes(0) && Buffer.from(text).equals(bytes) ? Buffer.from(text.replace(/\r\n/g, '\n')) : bytes;
};
export function sourcePath(relative) {
  if (typeof relative !== 'string' || !relative || relative === '.' || relative === '..' ||
      path.posix.isAbsolute(relative) || path.posix.normalize(relative) !== relative ||
      /[\\:\x00-\x1f]/.test(relative) || relative.startsWith('../') || relative.split('/').some(p =>
        p.toLowerCase() === '.git' || /[. ]$/.test(p) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) {
    throw new Error('Unsafe project-relative path: ' + String(relative));
  }
  return relative;
}
function run(root, args, optional = false) {
  const r = spawnSync('git', ['--literal-pathspecs', ...args], { cwd: root, encoding: null, windowsHide: true, maxBuffer: 128 * 1024 * 1024, timeout: 30000 });
  if (r.status !== 0 && !optional) throw new Error('Git read failed: ' + args[0] + ': ' + (r.stderr?.toString().trim() || r.error?.message || 'unknown failure'));
  return r.status === 0 ? r.stdout : null;
}
export function headRevision(root) {
  return run(root, ['rev-parse', '--verify', 'HEAD'], true)?.toString().trim() || null;
}
export function listSnapshotFiles(root, { staged = false, revision = null } = {}) {
  if (revision && !/^[a-f0-9]{40,64}$/.test(revision)) throw new Error('Use an immutable full revision.');
  const args = revision ? ['ls-tree', '-r', '--name-only', '-z', revision] : staged
    ? ['ls-files', '--cached', '-z'] : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'];
  const files = [...new Set(run(root, args).toString('utf8').split('\0').filter(Boolean))];
  if (files.length > 100000) throw new Error('Source inventory budget exceeded.');
  return files.map(sourcePath).sort();
}
export function readSnapshotFile(rootInput, relative, { staged = false, revision = null } = {}) {
  sourcePath(relative);
  const root = fs.realpathSync(rootInput);
  if (revision || staged) {
    if (revision && !/^[a-f0-9]{40,64}$/.test(revision)) throw new Error('Use an immutable full revision.');
    const listing = revision
      ? run(root, ['ls-tree', '-z', revision, '--', relative]).toString()
      : run(root, ['ls-files', '--stage', '-z', '--', relative]).toString();
    if (!listing || !listing.startsWith('100') || (!revision && listing.split('\t')[0].split(' ').at(-1) !== '0')) {
      throw new Error('Missing, unmerged or non-regular snapshot file: ' + relative);
    }
    const bytes = run(root, ['show', (revision ? revision : '') + ':' + relative]);
    if (bytes.length > 16 * 1024 * 1024) throw new Error('Source file byte budget exceeded: ' + relative);
    return bytes;
  }
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Source links require explicit handling: ' + relative);
  }
  const stat = fs.statSync(current);
  if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('Source file type/byte budget exceeded: ' + relative);
  return fs.readFileSync(current);
}
export function readSnapshotFiles(rootInput, selected, options = {}) {
  const root = fs.realpathSync(rootInput);
  if (options.revision && !/^[a-f0-9]{40,64}$/.test(options.revision)) throw new Error('Use an immutable full revision.');
  if (!Array.isArray(selected) || selected.length > 100000 || new Set(selected).size !== selected.length) throw new Error('Invalid source selection.');
  selected.forEach(sourcePath);
  // Batch Git object reads: do not start a process for each source file in a large module.
  const snapshots = new Map();
  if (selected.length && (options.staged || options.revision)) {
    const listing = run(root, options.revision ? ['ls-tree', '-r', '-z', options.revision] : ['ls-files', '--stage', '-z']).toString('utf8');
    const selectedSet = new Set(selected), objects = [];
    for (const entry of listing.split('\0').filter(Boolean)) {
      const tab = entry.indexOf('\t'), file = entry.slice(tab + 1), parts = entry.slice(0, tab).split(' ');
      if (!selectedSet.has(file)) continue;
      if (!['100644', '100755'].includes(parts[0]) || (!options.revision && parts[2] !== '0')) { if (options.tolerateMissing) continue; throw new Error('Non-regular or unmerged source: ' + file); }
      objects.push({ file, oid: options.revision ? parts[2] : parts[1] });
    }
    if (!options.tolerateMissing && objects.length !== selected.length) throw new Error('Source snapshot changed during observation.');
    if (!objects.length) return snapshots;
    const batch = spawnSync('git', ['cat-file', '--batch'], { cwd: root, input: objects.map(o => o.oid).join('\n') + '\n', encoding: null, windowsHide: true, timeout: 30000, maxBuffer: 130 * 1024 * 1024 });
    if (batch.status !== 0 || batch.error) throw new Error('Git batch source read failed: ' + (batch.error?.message || batch.stderr));
    let cursor = 0, total = 0;
    for (const o of objects) {
      const end = batch.stdout.indexOf(10, cursor), header = batch.stdout.subarray(cursor, end).toString().split(' '), size = Number(header[2]);
      if (header[0] !== o.oid || header[1] !== 'blob' || !Number.isSafeInteger(size) || size > 16 * 1024 * 1024 || size < 0 || end < cursor || end + size + 1 >= batch.stdout.length) throw new Error('Invalid or oversized source blob: ' + o.file);
      total += size; if (total > 128 * 1024 * 1024) throw new Error('Snapshot byte budget exceeded.');
      snapshots.set(o.file, batch.stdout.subarray(end + 1, end + 1 + size)); cursor = end + size + 2;
    }
  }
  return snapshots;
}
export function captureObservation(rootInput, paths, options = {}) {
  const root = fs.realpathSync(rootInput);
  if (!Array.isArray(paths) || !paths.length || paths.length > 1000 || new Set(paths).size !== paths.length) throw new Error('Select distinct literal source paths.');
  paths.forEach(sourcePath);
  const selected = listSnapshotFiles(root, options).filter(file => paths.some(p => file === p || file.startsWith(p + '/')));
  const snapshots = readSnapshotFiles(root, selected, options);
  const files = []; let total = 0;
  for (const file of selected) {
    if (!options.staged && !options.revision && !fs.existsSync(path.join(root, file))) continue;
    const bytes = snapshots.get(file) || readSnapshotFile(root, file, options); total += bytes.length;
    if (total > 128 * 1024 * 1024) throw new Error('Source observation byte budget exceeded.');
    files.push([file, hash(normalized(bytes))]);
  }
  return { kind: options.revision ? 'commit' : options.staged ? 'index' : 'worktree',
    base_revision: options.revision || headRevision(root),
    digest: hash(JSON.stringify({ paths: [...paths].sort(), files })), file_count: files.length };
}
export function stagedChanges(root) {
  if (run(root, ['ls-files', '-u', '-z']).length) throw new Error('Resolve unmerged index entries before preparing a commit.');
  const fields = run(root, ['diff', '--cached', '--name-status', '-z', '--find-renames']).toString('utf8').split('\0').filter(Boolean);
  const changes = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i++], before = sourcePath(fields[i++]);
    changes.push(/^[RC]/.test(status) ? { status, before, path: sourcePath(fields[i++]) } : { status, before: status[0] === 'A' ? null : before, path: before });
  }
  return { base_revision: headRevision(root), index_fingerprint: hash(run(root, ['ls-files', '--stage', '-z'])), changes };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.includes('--help')) { console.log('accord-scope.mjs --project DIR --paths PATH,PATH [--staged | --revision FULL_SHA]'); process.exit(0); }
    const args = {};
    for (let i = 2; i < process.argv.length; i++) {
      const key = process.argv[i];
      if (key === '--staged') args.staged = true;
      else if (['--project', '--paths', '--revision'].includes(key) && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) args[key.slice(2)] = process.argv[++i];
      else throw new Error('Unknown or incomplete source-view option: ' + key);
    }
    if (args.staged && args.revision) throw new Error('Choose one source view.');
    console.log(JSON.stringify(captureObservation(args.project || '.', args.paths?.split(','), args), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
