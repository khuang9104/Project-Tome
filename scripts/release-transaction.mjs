// Replace only generated release artifacts. Business files and .git are not targets.
import fs from 'node:fs';
import path from 'node:path';

export function replaceGeneratedArtifacts(releaseRoot, stagingRoot, filesystem = fs) {
  const root = fs.realpathSync(releaseRoot);
  const stage = fs.realpathSync(stagingRoot);
  if (path.dirname(stage) !== root || !path.basename(stage).startsWith('.accord-release-build-')) {
    throw new Error('Release staging must be a dedicated direct child of the release directory.');
  }
  const targets = ['payload', 'vendor', 'RELEASE.json', 'SHA256SUMS'].map(name => ({
    staged: path.join(stage, name), destination: path.join(root, name),
    backup: path.join(root, name + '.accord-backup-' + process.pid), backedUp: false, installed: false
  }));
  // Preflight all paths before the first move; never overwrite a recovery copy.
  for (const target of targets) {
    for (const location of [target.staged, target.destination, target.backup]) {
      if (fs.existsSync(location) && fs.lstatSync(location).isSymbolicLink()) throw new Error('Release target cannot be a symbolic link: ' + location);
    }
    if (!fs.existsSync(target.staged)) throw new Error('Missing staged release artifact: ' + target.staged);
    if (fs.existsSync(target.backup)) throw new Error('Refusing to overwrite stale release backup: ' + target.backup);
  }
  try {
    for (const target of targets) {
      if (fs.existsSync(target.destination)) {
        filesystem.renameSync(target.destination, target.backup);
        target.backedUp = true;
      }
      filesystem.renameSync(target.staged, target.destination);
      target.installed = true;
    }
  } catch (error) {
    const recoveryErrors = [];
    for (const target of [...targets].reverse()) {
      try {
        if (target.installed) filesystem.rmSync(target.destination, { recursive: true, force: true });
        if (target.backedUp) filesystem.renameSync(target.backup, target.destination);
      } catch (recoveryError) { recoveryErrors.push(recoveryError.message); }
    }
    if (recoveryErrors.length) throw new Error(error.message + '; recovery incomplete; preserve backups: ' + recoveryErrors.join('; '));
    throw error;
  }
  for (const target of targets) {
    if (target.backedUp) filesystem.rmSync(target.backup, { recursive: true, force: true });
  }
}
