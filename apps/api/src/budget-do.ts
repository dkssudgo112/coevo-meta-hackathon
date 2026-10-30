import { DurableObject } from 'cloudflare:workers';
import { emptyLedger, ledgerAdjust, ledgerReserve, lifetimeCap, modalCap, type Ledger } from '../../../packages/core/src/budget.ts';
import type { Env } from './env.ts';

export type LedgerScope = 'meta' | 'modal' | 'fake';

/**
 * Spend authority for one scope ("global" = Meta, "modal", or the isolated
 * fake-test ledger). Each object keeps a lifetime ledger that day rollover,
 * restarts, deployments, workspaces and scripts can never reset. Durable
 * Object input gates make each reserve (read → check → write) atomic.
 * Paid calls are enabled only on the deployed Worker, so this deployment's
 * objects are the single authority. This is an application-enforced budget,
 * not a provider billing cap.
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

  async reserve(usd: number, scope: LedgerScope = 'meta'): Promise<boolean> {
    if (!(await this.checkScope(scope))) return false;
    const r = ledgerReserve(await this.ledger(), usd, this.cap(scope));
    if (r.ok) await this.ctx.storage.put('lifetime', r.ledger);
    return r.ok;
  }

  /** Replace a reservation with the actual amount (delta may be negative, never below zero). */
  async adjust(deltaUsd: number): Promise<void> {
    await this.ctx.storage.put('lifetime', ledgerAdjust(await this.ledger(), deltaUsd));
  }

  /** Reserve spend made outside the app (e.g. a Modal probe) before it runs, with an audit label. */
  async reserveExternal(usd: number, label: string, scope: LedgerScope): Promise<boolean> {
    if (!(usd > 0 && usd <= 1)) return false;
    if (!(await this.reserve(usd, scope))) return false;
    const log = (await this.ctx.storage.get<{ at: string; usd: number; label: string }[]>('external')) ?? [];
    await this.ctx.storage.put('external', [...log, { at: new Date().toISOString(), usd, label: label.slice(0, 80) }].slice(-200));
    return true;
  }

  async externalLog(): Promise<{ at: string; usd: number; label: string }[]> {
    return (await this.ctx.storage.get<{ at: string; usd: number; label: string }[]>('external')) ?? [];
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
