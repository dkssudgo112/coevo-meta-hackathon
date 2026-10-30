// Cost breakdown from the deployment's own budget authority (read-only).
// Groups lifetime-ledger tickets by task and prints counts, reserved and actual USD.
// Needs COEVO_ADMIN_TOKEN in the environment or .dev.vars; the token is never printed.
//
//   node scripts/cost-report.mjs https://<deployment> [sinceISO] [workspaceId] [meta|modal]

import { readConfig } from './config.mjs';

const [, , base, since = '', workspace = '', ledger = 'meta'] = process.argv;
if (!base?.startsWith('https://')) {
  console.error('Usage: node scripts/cost-report.mjs https://<deployment> [sinceISO] [workspaceId] [meta|modal]');
  process.exit(2);
}
const env = { ...readConfig(), ...process.env };
if (!env.COEVO_ADMIN_TOKEN) { console.error('Set COEVO_ADMIN_TOKEN (environment or .dev.vars).'); process.exit(2); }

const q = new URLSearchParams({ ledger, ...(since ? { since } : {}) });
const res = await fetch(`${base}/api/admin/tickets?${q}`, { headers: { Authorization: `Bearer ${env.COEVO_ADMIN_TOKEN}` } });
if (!res.ok) { console.error(`Ledger request failed: ${res.status}`); process.exit(1); }
const { tickets } = await res.json();

// Labels are "<workspaceId>:<task>" for app calls and "external: …" for reserved probes.
const rows = tickets.filter(t => !workspace || t.label.startsWith(`${workspace}:`));
const groups = new Map();
for (const t of rows) {
  const task = t.label.includes(':') && !t.label.startsWith('external') ? t.label.slice(t.label.indexOf(':') + 1) : t.label;
  const g = groups.get(task) ?? { calls: 0, reservedUsd: 0, actualUsd: 0, open: 0 };
  g.calls++;
  g.reservedUsd += t.usd;
  if (t.status === 'settled') g.actualUsd += t.actual ?? 0; else { g.open++; g.actualUsd += t.usd; }
  groups.set(task, g);
}
const round = n => Number(n.toFixed(4));
const table = [...groups].sort((a, b) => b[1].actualUsd - a[1].actualUsd).map(([task, g]) => ({ task, calls: g.calls, reservedUsd: round(g.reservedUsd), chargedUsd: round(g.actualUsd), unsettled: g.open }));
console.table(table);
const total = rows.reduce((n, t) => n + (t.status === 'settled' ? t.actual ?? 0 : t.usd), 0);
console.log(JSON.stringify({ ledger, since: since || null, workspace: workspace || null, tickets: rows.length, chargedUsd: round(total), note: 'Unsettled tickets count at their full reservation.' }));
