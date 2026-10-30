import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, readConfig, secretPath } from './config.mjs';

const env = readConfig();
const rows = [];
let failures = 0;
function check(name, ok, detail) { rows.push({ name, status: ok ? 'OK' : 'FAIL', detail }); if (!ok) failures++; }
check('Node.js', Number(process.versions.node.split('.')[0]) >= 22, process.versions.node);
check('Local secret file', existsSync(secretPath), '.dev.vars');
check('Secret permissions', existsSync(secretPath) && (statSync(secretPath).mode & 0o077) === 0, 'owner only');
for (const item of ['.dev.vars', 'private/account-status.md', 'artifacts/test.png']) {
  check(`Git ignores ${item}`, spawnSync('git', ['check-ignore', '--quiet', item], { cwd: root }).status === 0, 'excluded from publication');
}
check('Meta destination', env.META_API_BASE_URL === 'https://api.meta.ai/v1', 'official endpoint');
rows.push({ name: 'Meta API key', status: env.MODEL_API_KEY?.trim() ? 'CONFIGURED' : 'PENDING', detail: 'value never printed' });
rows.push({ name: 'Live inference', status: env.COEVO_ALLOW_LIVE_CALLS === 'true' ? 'ENABLED' : 'OFF', detail: 'explicit opt-in' });
rows.push({ name: 'Modal SDK', status: existsSync(path.join(root, '.venv/bin/modal')) ? 'INSTALLED' : 'PENDING', detail: 'uv sync' });
rows.push({ name: 'Modal authentication', status: existsSync(path.join(process.env.HOME, '.modal.toml')) ? 'CHECK_PROFILE' : 'PENDING', detail: 'separate from credit grant' });
rows.push({ name: 'Muse Code', status: existsSync(path.join(process.env.HOME, '.local/bin/muse')) ? 'INSTALLED' : 'PENDING', detail: 'npm run muse -- --version' });
console.table(rows);
process.exitCode = failures ? 1 : 0;
