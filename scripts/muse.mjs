// Muse Code launcher. Muse Code is out of product scope, and during the bounded
// budget validation every paid path must go through the deployed budget gate.
// So only --help / --version run (they need no key); everything else refuses
// unconditionally and the Meta key is never passed to the child.
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const helpOnly = args.length > 0 && args.every(a => ['--help', '-h', '--version', '-V'].includes(a));
if (!helpOnly) {
  console.error('Muse Code sessions are disabled in this project: paid Meta calls must go through the deployed budget gate. Only --help and --version are allowed.');
  process.exit(2);
}
const binary = path.join(process.env.HOME ?? '', '.local/bin/muse');
if (!existsSync(binary)) {
  console.error('Muse Code is not installed.');
  process.exit(2);
}
const { MODEL_API_KEY, META_API_KEY, ...clean } = process.env;
void MODEL_API_KEY; void META_API_KEY;
const child = spawn(binary, args, { stdio: 'inherit', env: clean });
child.on('error', () => { console.error('Unable to start Muse Code.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
