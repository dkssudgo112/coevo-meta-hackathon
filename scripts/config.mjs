import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const secretPath = path.join(root, '.dev.vars');
export function readConfig() {
  return { ...(existsSync(secretPath) ? parseEnv(readFileSync(secretPath, 'utf8')) : {}), ...process.env };
}
