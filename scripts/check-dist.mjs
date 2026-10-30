// Before a deploy: every file the build copied from apps/web/public must be tracked in Git, so an
// unreviewed local file (for example media awaiting publication review) can never be deployed.
// Generated bundles (dist/assets, index.html) are not checked here.
import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const dist = 'apps/web/dist';
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p); else files.push(path.relative(dist, p));
  }
})(dist);
const tracked = new Set(spawnSync('git', ['ls-files', 'apps/web/public'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map(f => f.slice('apps/web/public/'.length)));
const extra = files.filter(f => !f.startsWith('assets/') && f !== 'index.html' && !tracked.has(f));
if (extra.length) {
  console.error(`Not tracked in Git, refusing to deploy:\n${extra.map(f => `  ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(`dist ok: ${files.length} files, all public files tracked.`);
