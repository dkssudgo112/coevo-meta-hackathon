import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== '--staged')) {
  console.error('Usage: node scripts/release-check.mjs [--staged]');
  process.exit(2);
}
const staged = args[0] === '--staged';
function git(args, encoding) {
  const result = spawnSync('git', args, { cwd: root, ...(encoding ? { encoding } : {}), maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Unable to inspect Git content. Publication check failed closed.');
  return result.stdout;
}
// Binaries are allowed only when their exact bytes were reviewed (path + SHA-256).
// A missing list means no binary is allowed.
function loadReviewed() {
  let raw;
  try { raw = readFileSync(path.join(root, 'scripts/reviewed-assets.json'), 'utf8'); } catch (error) { if (error.code === 'ENOENT') return new Map(); throw error; }
  return new Map(JSON.parse(raw).assets.map(a => [a.path, a.sha256]));
}
const reviewed = loadReviewed();
const credentialPatterns = [
  /LLM[_|][A-Za-z0-9_|.-]{25,}/,
  /\b(?:ak|as)-[A-Za-z0-9_-]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
];
function privatePath(file) {
  return /(^|\/)(private|artifacts|node_modules|\.venv|dist|\.wrangler|\.claude|\.codex|\.vscode|\.idea)(\/|$)/i.test(file)
    || /(^|\/)claude\.md$/i.test(file)
    || /(^|\/)\.dev\.vars(?:\.|$)/i.test(file)
    || /(^|\/)\.env(?:\.|$)/i.test(file) && file !== '.env.example'
    || /(^|\/)(\.modal\.toml|\.envrc|credentials\.json|service-account[^/]*\.json)$/i.test(file)
    || /\.(pem|key|p12|pfx|log)$/i.test(file);
}
try {
  if (git(['ls-files', '--unmerged'], 'utf8').trim()) throw new Error('Resolve merge conflicts before publication.');
  const index = new Map(git(['ls-files', '--stage', '-z'], 'utf8').split('\0').filter(Boolean).map(entry => {
    const split = entry.indexOf('\t');
    return [entry.slice(split + 1), entry.slice(0, split).split(' ')[0]];
  }));
  const files = staged ? [...index.keys()] : [...new Set(git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], 'utf8').split('\0').filter(Boolean))];
  if (!files.length) throw new Error('No files to inspect. Stage the intended public files first.');
  const issues = [];
  for (const file of files) {
    if (privatePath(file)) issues.push(`${file}: private path`);
    if (staged && !['100644', '100755'].includes(index.get(file))) {
      issues.push(`${file}: symlink or submodule requires manual review`); continue;
    }
    let data;
    if (staged) data = git(['show', `:${file}`]);
    else {
      let stat;
      try { stat = lstatSync(path.join(root, file)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (!stat.isFile()) { issues.push(`${file}: non-regular file requires manual review`); continue; }
      data = readFileSync(path.join(root, file));
    }
    if (data.includes(0)) {
      const sha = createHash('sha256').update(data).digest('hex');
      if (reviewed.get(file) !== sha) issues.push(`${file}: binary content requires manual review${reviewed.has(file) ? ' (bytes changed since review)' : ''}`);
      continue;
    }
    const content = data.toString('utf8');
    if (credentialPatterns.some(re => re.test(content))) issues.push(`${file}: possible credential`);
    if (/\/(?:Users|home)\/[A-Za-z0-9_.-]+\//.test(content)) issues.push(`${file}: personal machine path`);
    if (/https?:\/\/[^\s/]+:[^\s/]+@/.test(content)) issues.push(`${file}: credential-bearing URL`);
  }
  console.log(`Checked ${files.length} ${staged ? 'Git index' : 'working-tree'} files. Ownership and content still require human review.`);
  if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
  else console.log('No known credential pattern, private path, or unreviewed binary found.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
