import { DurableObject } from 'cloudflare:workers';
import { lifetimeCap } from '../../../packages/core/src/budget.ts';
import type { Env } from './env.ts';

interface Ledger { spentUsd: number; calls: number; since: string }

/**
 * The single spend authority for paid calls in this deployment. It keeps a
 * lifetime ledger that is never reset by day, deployment, workspace or script.
 * Local runtimes have their own storage, so paid calls are only enabled on the
 * deployed Worker; fake-model test runs use a separately named ledger.
 */
export class Budget extends DurableObject<Env> {
  private async ledger(): Promise<Ledger> {
    return (await this.ctx.storage.get<Ledger>('lifetime')) ?? { spentUsd: 0, calls: 0, since: new Date().toISOString() };
  }

  private cap(): number {
    return lifetimeCap(this.env.COEVO_LIFETIME_CAP_USD);
  }

  async reserve(usd: number): Promise<boolean> {
    const l = await this.ledger();
    if (l.spentUsd + usd > this.cap() + 1e-9) return false;
    await this.ctx.storage.put('lifetime', { ...l, spentUsd: l.spentUsd + usd, calls: l.calls + 1 });
    return true;
  }

  /** Replace a reservation with the actual amount (delta may be negative, never below zero). */
  async adjust(deltaUsd: number): Promise<void> {
    const l = await this.ledger();
    await this.ctx.storage.put('lifetime', { ...l, spentUsd: Math.max(0, l.spentUsd + deltaUsd) });
  }

  /** Reserve spend made outside the app (e.g. a Modal probe) before it runs, with an audit label. */
  async reserveExternal(usd: number, label: string): Promise<boolean> {
    if (!(usd > 0 && usd <= 1)) return false;
    if (!(await this.reserve(usd))) return false;
    const log = (await this.ctx.storage.get<{ at: string; usd: number; label: string }[]>('external')) ?? [];
    await this.ctx.storage.put('external', [...log, { at: new Date().toISOString(), usd, label: label.slice(0, 80) }].slice(-200));
    return true;
  }

  async externalLog(): Promise<{ at: string; usd: number; label: string }[]> {
    return (await this.ctx.storage.get<{ at: string; usd: number; label: string }[]>('external')) ?? [];
  }

  async status(): Promise<{ spentUsd: number; capUsd: number; scope: 'lifetime'; calls: number; since: string }> {
    const l = await this.ledger();
    return { spentUsd: Number(l.spentUsd.toFixed(4)), capUsd: this.cap(), scope: 'lifetime', calls: l.calls, since: l.since };
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
