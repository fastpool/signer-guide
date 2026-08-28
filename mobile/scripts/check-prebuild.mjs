/**
 * Fails if the committed `android/` no longer matches what app.json generates.
 *
 * `android/` is committed because F-Droid builds from the tag and needs the
 * native project to be there (see ../.gitignore). That buys reproducibility and
 * costs a second place for the manifest, the icons and the version to live in.
 * This is what stops the two drifting: regenerate from scratch, and diff.
 *
 * Run it before tagging a release. If it fails, the fix is almost always to
 * commit what it regenerated — app.json is the source, `android/` is the
 * artefact.
 */
import { execFileSync } from 'node:child_process';

const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });

const dirty = run('git', ['status', '--porcelain', '--', 'android']).trim();
if (dirty) {
  console.error('android/ has uncommitted changes; commit or stash them first:\n' + dirty);
  process.exit(1);
}

console.log('Regenerating android/ from app.json…');
run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install', '--clean']);

const drift = run('git', ['status', '--porcelain', '--', 'android']).trim();
if (!drift) {
  console.log('android/ matches app.json.');
  process.exit(0);
}

console.error(
  'android/ has drifted from app.json:\n' +
    drift +
    '\n\nReview `git diff -- android` and commit it.',
);
process.exit(1);
