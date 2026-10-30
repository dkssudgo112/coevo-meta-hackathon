import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { root, readConfig } from './config.mjs';

const args = process.argv.slice(2);
const env = readConfig();
const helpOnly = args.length > 0 && args.every(a => ['--help', '-h', '--version', '-V'].includes(a));
const binary = path.join(process.env.HOME, '.local/bin/muse');
if (!existsSync(binary)) {
  console.error('Muse Code is not installed. See docs/API-SETUP.md.');
  process.exit(2);
}
if (!helpOnly && env.COEVO_ALLOW_LIVE_CALLS !== 'true') {
  console.error('Live Muse sessions are disabled. Confirm credit/billing status before enabling COEVO_ALLOW_LIVE_CALLS.');
  process.exit(2);
}
if (!helpOnly && (!env.MODEL_API_KEY?.trim() || env.META_API_BASE_URL !== 'https://api.meta.ai/v1')) {
  console.error('Meta key or official endpoint is not configured.');
  process.exit(2);
}
const child = spawn(binary, helpOnly ? args : [
  '--provider', 'meta', '--model', env.META_TEXT_MODEL,
  '--base-url', env.META_API_BASE_URL, '--workspace', root, ...args,
], {
  cwd: root,
  stdio: 'inherit',
  env: helpOnly ? process.env : { ...process.env, META_API_KEY: env.MODEL_API_KEY },
});
child.on('error', () => { console.error('Unable to start Muse Code.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
