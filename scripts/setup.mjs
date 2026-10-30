import { mkdirSync, copyFileSync, existsSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { root, secretPath } from './config.mjs';

for (const dir of ['private', 'private/checks', 'private/reference', 'artifacts']) {
  mkdirSync(path.join(root, dir), { recursive: true, mode: 0o700 });
}
if (!existsSync(secretPath)) copyFileSync(path.join(root, '.env.example'), secretPath);
chmodSync(secretPath, 0o600);
console.log('Local configuration prepared. Existing secret values were preserved.');
