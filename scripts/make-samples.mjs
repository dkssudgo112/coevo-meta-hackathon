// Writes the sample-session manifest. Every screen is a reviewed screenshot of an
// actual Meta AI reply to a scripted, fictional café scenario (listed with its exact
// SHA-256 in scripts/reviewed-assets.json). Session 2 is a separate recorded chat that
// started with a Coevo card from an earlier run; it is not an elapsed week.
// Usage: node scripts/make-samples.mjs

import { writeFileSync } from 'node:fs';

const out = new URL('../apps/web/public/samples/', import.meta.url);
const ACTUAL = 'actual-meta-ai';
const frames = [
  { file: 'meta-ai-1.jpg', session: 1, provenance: ACTUAL, caption: 'They ask Meta AI for a premium poster for a new dessert. Meta AI makes one straight away.' },
  { file: 'meta-ai-2.jpg', session: 1, provenance: ACTUAL, caption: '“Make it more premium.”' },
  { file: 'meta-ai-3.jpg', session: 1, provenance: ACTUAL, caption: '“Still not premium enough. Make it more premium.”' },
  { file: 'meta-ai-4.jpg', session: 1, provenance: ACTUAL, caption: '“Even more premium, please.” — the fourth vague request.' },
  { file: 'meta-ai-5.jpg', session: 1, provenance: ACTUAL, caption: 'They write a specific brief: who, what, price, feeling, and no real photo yet. Meta AI also added opening hours nobody gave it — unverified.' },
  { file: 'meta-ai-6.jpg', session: 2, provenance: ACTUAL, caption: 'A separate recorded Meta AI chat that began with a Coevo card from an earlier run. Asked for a new drink poster, Meta AI asks for the four details first.' },
];
writeFileSync(new URL('manifest.json', out), JSON.stringify({
  note: 'Actual Meta AI replies to a scripted, fictional café scenario (not a real user). Session 2 is a separate recorded chat that began with a Coevo card from an earlier run, not an elapsed week.',
  frames,
}, null, 2) + '\n');
console.log(`Wrote the sample manifest (${frames.length} screens) to apps/web/public/samples/`);
