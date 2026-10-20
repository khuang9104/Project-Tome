#!/usr/bin/env node
// Explicit opt-in installation. Never overwrite another hook configuration.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export function configureHook(root, { install = false } = {}) {
  const git = args => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000 }); if (r.error || (r.status !== 0 && r.status !== 1)) throw new Error(r.error?.message || r.stderr || 'Git failed'); return r.stdout.trim(); };
  const top = git(['rev-parse', '--show-toplevel']);
  if (fs.realpathSync(root).toLowerCase() !== fs.realpathSync(top).toLowerCase()) throw new Error('Run hook setup from the repository root.');
  const current = git(['config', '--get', 'core.hooksPath']);
  const hook = path.join(root, '.accord/hooks/pre-commit');
  for (const relative of ['.accord', '.accord/hooks', '.accord/hooks/pre-commit']) if (fs.existsSync(path.join(root, relative)) && fs.lstatSync(path.join(root, relative)).isSymbolicLink()) throw new Error('Hook path must not traverse a symbolic link.');
  if (!fs.existsSync(hook) || fs.lstatSync(hook).isSymbolicLink() || !fs.statSync(hook).isFile()) throw new Error('Install and review .accord/hooks/pre-commit first.');
  if (fs.statSync(hook).nlink > 1) throw new Error('Hook path must not be hard-linked.');
  if (current && current !== '.accord/hooks') throw new Error('Existing core.hooksPath: ' + current + '. Integrate the Project Tome check into that hook manually.');
  const prior = git(['rev-parse', '--git-path', 'hooks/pre-commit']);
  if (!current && fs.existsSync(path.resolve(root, prior))) throw new Error('Existing pre-commit hook; integrate the Project Tome check manually.');
  if (install) { fs.chmodSync(hook, 0o755); git(['config', '--local', 'core.hooksPath', '.accord/hooks']); }
  return { active: current === '.accord/hooks' || install, installed_now: install, hook: '.accord/hooks/pre-commit', limitation: 'Local Git hooks can be bypassed. Agent pre-commit semantic reconciliation remains required.' };
}
function main() {
  try {
    const args = process.argv.slice(2); if (args.includes('--help')) { console.log('accord-hook.mjs [--project DIR] [--install]'); return; }
    let root = '.', install = false;
    for (let i = 0; i < args.length; i++) { if (args[i] === '--install') install = true; else if (args[i] === '--project' && args[i + 1]) root = args[++i]; else throw new Error('Unknown option: ' + args[i]); }
    console.log(JSON.stringify(configureHook(path.resolve(root), { install }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
