import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root, readConfig } from './config.mjs';

const env = readConfig();
const mode = process.argv[2] ?? 'models';
if (!['models', 'smoke'].includes(mode)) throw new Error('Use models or smoke.');
if (!env.MODEL_API_KEY?.trim()) { console.error('MODEL_API_KEY is not configured. Run npm run secrets:set -- MODEL_API_KEY.'); process.exit(2); }
if (env.META_API_BASE_URL !== 'https://api.meta.ai/v1') throw new Error('Only the verified Meta endpoint is allowed.');
if (mode === 'smoke' && env.COEVO_ALLOW_LIVE_CALLS !== 'true') {
  console.error('Live inference is disabled. Confirm free credits and enable COEVO_ALLOW_LIVE_CALLS intentionally.'); process.exit(2);
}
const url = `${env.META_API_BASE_URL}/${mode === 'models' ? 'models' : 'responses'}`;
let result;
try {
  const response = await fetch(url, {
    method: mode === 'models' ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${env.MODEL_API_KEY}`, 'Content-Type': 'application/json' },
    ...(mode === 'smoke' ? { body: JSON.stringify({ model: env.META_TEXT_MODEL, input: 'Reply with only READY.', max_output_tokens: 128, reasoning: { effort: 'minimal' }, store: false }) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  result = { checkedAt: new Date().toISOString(), mode, httpStatus: response.status, ok: response.ok,
    ...(mode === 'models' && response.ok ? { models: (data.data ?? []).map(m => m.id), configuredModelAvailable: (data.data ?? []).some(m => m.id === env.META_TEXT_MODEL) } : {}),
    ...(mode === 'smoke' && response.ok ? { model: data.model, status: data.status, usage: data.usage, outputPresent: (data.output ?? []).some(m => m.type === 'message' && m.content?.some(c => c.type === 'output_text')) } : {}),
    ...(!response.ok ? { errorCode: data.error?.code ?? 'provider_error' } : {}),
  };
} catch (error) {
  result = { checkedAt: new Date().toISOString(), mode, ok: false, error: error.name === 'TimeoutError' ? 'timeout' : 'connection_failed' };
}
const dir = path.join(root, 'private/checks');
mkdirSync(dir, { recursive: true, mode: 0o700 });
writeFileSync(path.join(dir, `meta-${mode}.json`), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.ok ? 0 : 1;
