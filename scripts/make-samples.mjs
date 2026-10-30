// Writes the sample-session manifest.
// Session 1 uses five reviewed screenshots of actual Meta AI replies to a scripted,
// fictional café scenario (apps/web/public/samples/meta-ai-*.jpg, listed in
// scripts/reviewed-assets.json). The follow-up screen is still a generated mock-up
// of a generic AI chat (SVG) and is labeled as such.
// Usage: node scripts/make-samples.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

const out = new URL('../apps/web/public/samples/', import.meta.url);
mkdirSync(out, { recursive: true });

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function wrapText(text, max) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

function screen(turns) {
  const W = 1280, H = 800;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#f7f7f8"/>`,
    `<rect width="${W}" height="56" fill="#ffffff"/><line x1="0" y1="56" x2="${W}" y2="56" stroke="#e3e3e6"/>`,
    `<circle cx="34" cy="28" r="12" fill="#4f6bed"/><text x="56" y="34" font-size="18" font-family="Helvetica, Arial" fill="#1b1b1f">AI Assistant</text>`,
    `<text x="${W - 24}" y="34" font-size="13" text-anchor="end" font-family="Helvetica, Arial" fill="#9a9aa2">sample screen</text>`,
    `<rect x="0" y="56" width="220" height="${H - 56}" fill="#efeff2"/>`,
    `<text x="20" y="96" font-size="14" font-family="Helvetica, Arial" fill="#55555c">New chat</text>`,
  ];
  // Conversation is laid out top-down, then scrolled so the latest turn sits just above
  // the input box, like a real chat app. Anything above the header is clipped.
  const convo = [];
  let y = 84;
  for (const t of turns.slice(-3)) {
    if (t.user) {
      const lines = wrapText(t.user, 58);
      const bw = Math.min(560, Math.max(...lines.map(l => l.length)) * 9.2 + 32);
      convo.push(`<rect x="${W - 60 - bw}" y="${y}" width="${bw}" height="${lines.length * 24 + 20}" rx="16" fill="#4f6bed"/>`);
      lines.forEach((l, i) => convo.push(`<text x="${W - 60 - bw + 16}" y="${y + 28 + i * 24}" font-size="17" font-family="Helvetica, Arial" fill="#ffffff">${esc(l)}</text>`));
      y += lines.length * 24 + 36;
    }
    if (t.ai) {
      const lines = wrapText(t.ai, 70);
      convo.push(`<circle cx="268" cy="${y + 14}" r="12" fill="#4f6bed"/>`);
      lines.forEach((l, i) => convo.push(`<text x="292" y="${y + 20 + i * 24}" font-size="17" font-family="Helvetica, Arial" fill="#1b1b1f">${esc(l)}</text>`));
      y += lines.length * 24 + 12;
      y += 16;
    }
  }
  const bottom = H - 104;
  const shift = Math.min(0, bottom - y);
  parts.push(`<defs><clipPath id="chat"><rect x="220" y="57" width="${W - 220}" height="${H - 57 - 92}"/></clipPath></defs>`);
  parts.push(`<g clip-path="url(#chat)"><g transform="translate(0,${shift})">${convo.join('')}</g></g>`);
  parts.push(`<rect x="250" y="${H - 84}" width="${W - 310}" height="56" rx="28" fill="#ffffff" stroke="#d6d6db"/>`);
  parts.push(`<text x="280" y="${H - 50}" font-size="16" font-family="Helvetica, Arial" fill="#a0a0a8">Message AI Assistant</text>`);
  parts.push('</svg>');
  return parts.join('');
}

const s2 = [
  { user: 'Make a poster for our new drink', ai: 'Before I make it: who is it for, what’s the price, what one feeling should it give, and do you have a real photo of the drink?' },
];

const ACTUAL = 'actual-meta-ai';
const MOCK = 'mock-up';
const frames = [
  { file: 'meta-ai-1.jpg', session: 1, provenance: ACTUAL, caption: 'They ask Meta AI for a premium poster for a new dessert. Meta AI makes one straight away.' },
  { file: 'meta-ai-2.jpg', session: 1, provenance: ACTUAL, caption: '“Make it more premium.”' },
  { file: 'meta-ai-3.jpg', session: 1, provenance: ACTUAL, caption: '“Still not premium enough. Make it more premium.”' },
  { file: 'meta-ai-4.jpg', session: 1, provenance: ACTUAL, caption: '“Even more premium, please.” — the fourth vague request.' },
  { file: 'meta-ai-5.jpg', session: 1, provenance: ACTUAL, caption: 'They write a specific brief: who, what, price, feeling, and no real photo yet. Meta AI also added opening hours nobody gave it — unverified.' },
];
s2.forEach((_, i) => {
  const file = `s2-${i + 1}.svg`;
  writeFileSync(new URL(file, out), screen(s2.slice(0, i + 1)));
  frames.push({ file, session: 2, provenance: MOCK, caption: 'A week later, in a chat that starts with the Caddie card: the AI asks first.' });
});
writeFileSync(new URL('manifest.json', out), JSON.stringify({
  note: 'Session 1: actual Meta AI replies to a scripted, fictional café scenario (not a real user). Session 2: a generated mock-up of a generic AI chat.',
  frames,
}, null, 2) + '\n');
console.log(`Wrote the manifest (${frames.length} frames) and ${s2.length} mock-up screen(s) to apps/web/public/samples/`);
