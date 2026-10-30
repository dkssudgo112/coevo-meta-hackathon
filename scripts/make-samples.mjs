// Generates the synthetic sample-session screens (fixture data) as SVG files.
// The screens imitate a generic AI chat, not any real product.
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

const posters = {
  plain: { bg: '#7a5230', fg: '#f3e6d0', title: 'NEW DESSERT', sub: 'Try it today', accent: '#c99a5b' },
  gold: { bg: '#3b2a1a', fg: '#f1d48a', title: 'NEW DESSERT', sub: 'A premium treat', accent: '#d4af37', border: true },
  black: { bg: '#121212', fg: '#e6c870', title: 'NEW DESSERT', sub: 'Luxury edition', accent: '#d4af37', border: true },
  black2: { bg: '#0b0b0b', fg: '#e9cf7a', title: 'NEW DESSERT', sub: 'Exclusive. Premium.', accent: '#e0bb4a', border: true, sparkle: true },
  specific: { bg: '#f3ead9', fg: '#2f3a2c', title: 'Matcha Basque Cheesecake', sub: 'For your 8 a.m. walk to Seongsu · ₩6,500', accent: '#7c9a5e', photo: true },
};

function poster(x, y, kind) {
  const p = posters[kind];
  const w = 220, h = 300;
  const parts = [`<g transform="translate(${x},${y})">`, `<rect width="${w}" height="${h}" rx="6" fill="${p.bg}"/>`];
  if (p.border) parts.push(`<rect x="10" y="10" width="${w - 20}" height="${h - 20}" fill="none" stroke="${p.accent}" stroke-width="3"/>`);
  if (p.sparkle) for (let i = 0; i < 9; i++) parts.push(`<circle cx="${30 + (i * 23) % 170}" cy="${40 + (i * 37) % 90}" r="2" fill="${p.accent}"/>`);
  if (p.photo) {
    parts.push(`<rect x="20" y="20" width="${w - 40}" height="150" rx="4" fill="#d9c9a8"/>`);
    parts.push(`<ellipse cx="${w / 2}" cy="110" rx="62" ry="38" fill="#9fb27a"/><ellipse cx="${w / 2}" cy="100" rx="62" ry="30" fill="#b8c98f"/>`);
    parts.push(`<text x="${w / 2}" y="160" font-size="9" text-anchor="middle" fill="#5a4a32" font-family="Helvetica, Arial">real photo</text>`);
    wrapText(p.title, 18).forEach((l, i) => parts.push(`<text x="${w / 2}" y="${200 + i * 22}" font-size="18" text-anchor="middle" fill="${p.fg}" font-family="Georgia, serif">${esc(l)}</text>`));
    wrapText(p.sub, 30).forEach((l, i) => parts.push(`<text x="${w / 2}" y="${256 + i * 14}" font-size="11" text-anchor="middle" fill="${p.fg}" font-family="Helvetica, Arial">${esc(l)}</text>`));
  } else {
    parts.push(`<text x="${w / 2}" y="140" font-size="26" text-anchor="middle" fill="${p.fg}" font-family="Georgia, serif" letter-spacing="2">${p.title.split(' ')[0]}</text>`);
    parts.push(`<text x="${w / 2}" y="172" font-size="26" text-anchor="middle" fill="${p.fg}" font-family="Georgia, serif" letter-spacing="2">${p.title.split(' ')[1]}</text>`);
    parts.push(`<text x="${w / 2}" y="214" font-size="13" text-anchor="middle" fill="${p.fg}" font-family="Helvetica, Arial">${esc(p.sub)}</text>`);
  }
  parts.push('</g>');
  return parts.join('');
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
      if (t.poster) { convo.push(poster(292, y, t.poster)); y += 312; } else y += 16;
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

const s1 = [
  { user: 'Make a poster for our new dessert', ai: 'Here is a poster for your new dessert.', poster: 'plain' },
  { user: 'Make it more premium', ai: 'I made it more premium with gold accents.', poster: 'gold' },
  { user: 'More premium please', ai: 'Here is a more luxurious version in black and gold.', poster: 'black' },
  { user: 'Even more premium. Luxurious.', ai: 'I added sparkle for an exclusive, premium feel.', poster: 'black2' },
  { user: 'It’s for office workers near Seongsu station on their morning walk. Matcha basque cheesecake, 6,500 won. Warm morning light, calm, a little handwritten. Use my real photo.', ai: 'Here is a calm morning poster using your photo, with the price.', poster: 'specific' },
];
const s2 = [
  { user: 'Make a poster for our new drink', ai: 'Before I make it: who is it for, what’s the price, what one feeling should it give, and do you have a real photo of the drink?' },
];

const frames = [];
s1.forEach((_, i) => {
  const file = `s1-${i + 1}.svg`;
  writeFileSync(new URL(file, out), screen(s1.slice(0, i + 1)));
  frames.push({ file, session: 1, caption: ['They ask for a dessert poster.', 'They ask for “more premium”.', '“More premium” again.', '“Even more premium” — the fourth vague request.', 'After the Caddie’s question, they write their own specific brief.'][i] });
});
s2.forEach((_, i) => {
  const file = `s2-${i + 1}.svg`;
  writeFileSync(new URL(file, out), screen(s2.slice(0, i + 1)));
  frames.push({ file, session: 2, caption: 'A week later, with the Caddie card in the AI’s memory: the AI asks first.' });
});
writeFileSync(new URL('manifest.json', out), JSON.stringify({
  note: 'Synthetic sample screens (fixture). The AI chat is a generic mock-up, not a real product.',
  frames,
}, null, 2));
console.log(`Wrote ${frames.length} sample screens to apps/web/public/samples/`);
