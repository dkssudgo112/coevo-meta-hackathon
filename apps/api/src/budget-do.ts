import { DurableObject } from 'cloudflare:workers';
import { emptyLedger, ledgerAdjust, ledgerReserve, lifetimeCap, modalCap, type Ledger } from '../../../packages/core/src/budget.ts';
import type { Env } from './env.ts';

export type LedgerScope = 'meta' | 'modal' | 'fake';

interface Ticket { usd: number; label: string; at: string; status: 'reserved' | 'settled'; actual?: number; settledAt?: string }

/**
 * Spend authority for one scope ("global" = Meta, "modal", or the isolated
 * fake-test ledger). Each object keeps a lifetime ledger that day rollover,
 * restarts, deployments, workspaces and scripts can never reset.
 *
 * Every reservation gets a durable ticket. Settling is idempotent per ticket:
 * a duplicate or late settlement (e.g. after eviction) is ignored, so it can
 * never refund another call's spend. Durable Object input gates make each
 * reserve/settle (read → check → write) atomic. This is an application-
 * enforced budget, not a provider billing cap.
 */
export class Budget extends DurableObject<Env> {
  private async ledger(): Promise<Ledger> {
    return (await this.ctx.storage.get<Ledger>('lifetime')) ?? emptyLedger(new Date().toISOString());
  }

  private cap(scope: LedgerScope): number {
    return scope === 'modal' ? modalCap(this.env.COEVO_MODAL_CAP_USD) : lifetimeCap(this.env.COEVO_LIFETIME_CAP_USD);
  }

  /** A ledger object serves exactly one scope for its whole life. */
  private async checkScope(scope: LedgerScope): Promise<boolean> {
    const stored = await this.ctx.storage.get<LedgerScope>('scope');
    if (!stored) { await this.ctx.storage.put('scope', scope); return true; }
    return stored === scope;
  }

  /** Reserve before dispatch. Returns a durable ticket id, or null when the cap would be exceeded. */
  async reserve(usd: number, scope: LedgerScope, label: string): Promise<string | null> {
    if (!(await this.checkScope(scope))) return null;
    const r = ledgerReserve(await this.ledger(), usd, this.cap(scope));
    if (!r.ok) return null;
    const id = crypto.randomUUID();
    const ticket: Ticket = { usd, label: label.slice(0, 80), at: new Date().toISOString(), status: 'reserved' };
    await this.ctx.storage.put({ lifetime: r.ledger, [`t:${id}`]: ticket });
    return id;
  }

  /** Settle a ticket to its actual amount exactly once. Unknown or already-settled tickets are ignored. */
  async settle(ticketId: string, actualUsd: number): Promise<boolean> {
    const key = `t:${ticketId}`;
    const t = await this.ctx.storage.get<Ticket>(key);
    if (!t || t.status === 'settled' || !(actualUsd >= 0) || !Number.isFinite(actualUsd)) return false;
    const ledger = ledgerAdjust(await this.ledger(), actualUsd - t.usd);
    await this.ctx.storage.put({ lifetime: ledger, [key]: { ...t, status: 'settled', actual: actualUsd, settledAt: new Date().toISOString() } });
    return true;
  }

  /** Read-only list of tickets (newest last) for cost breakdowns; never changes the ledger. */
  async tickets(since?: string): Promise<(Ticket & { id: string })[]> {
    const rows = await this.ctx.storage.list<Ticket>({ prefix: 't:' });
    return [...rows].map(([k, t]) => ({ ...t, id: k.slice(2) })).filter(t => !since || t.at >= since).sort((a, b) => a.at.localeCompare(b.at));
  }

  async ticket(ticketId: string): Promise<Ticket | null> {
    return (await this.ctx.storage.get<Ticket>(`t:${ticketId}`)) ?? null;
  }

  /** Reserve spend made outside the app (e.g. a Modal probe) before it runs. */
  async reserveExternal(usd: number, label: string, scope: LedgerScope): Promise<string | null> {
    if (!(usd > 0 && usd <= 1)) return null;
    const id = await this.reserve(usd, scope, `external: ${label}`);
    if (!id) return null;
    const log = (await this.ctx.storage.get<{ at: string; usd: number; label: string; ticket: string }[]>('external')) ?? [];
    await this.ctx.storage.put('external', [...log, { at: new Date().toISOString(), usd, label: label.slice(0, 80), ticket: id }].slice(-200));
    return id;
  }

  async externalLog(): Promise<{ at: string; usd: number; label: string; ticket: string }[]> {
    return (await this.ctx.storage.get<{ at: string; usd: number; label: string; ticket: string }[]>('external')) ?? [];
  }

  async status(scope: LedgerScope = 'meta'): Promise<{ spentUsd: number; capUsd: number; scope: 'lifetime'; ledger: LedgerScope; reservations: number; since: string }> {
    const l = await this.ledger();
    return { spentUsd: Number(l.spentUsd.toFixed(4)), capUsd: this.cap(scope), scope: 'lifetime', ledger: scope, reservations: l.reservations, since: l.since };
  }

  /** Allow at most `limit` workspace creations per key (hashed IP) per hour. */
  async allowCreate(key: string, limit = 20): Promise<boolean> {
    const hour = new Date().toISOString().slice(0, 13);
    const k = `create:${hour}:${key}`;
    const n = ((await this.ctx.storage.get<number>(k)) ?? 0) + 1;
    if (n > limit) return false;
    await this.ctx.storage.put(k, n);
    return true;
  }
}
