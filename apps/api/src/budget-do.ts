import { DurableObject } from 'cloudflare:workers';
import { CAPS, charge, dayKey, remaining, type BudgetState } from '../../../packages/core/src/budget.ts';

/** Global daily spend ledger and workspace-creation rate limit (singleton). */
export class Budget extends DurableObject {
  private async state(): Promise<BudgetState> {
    return (await this.ctx.storage.get<BudgetState>('global')) ?? { day: dayKey(Date.now()), spentUsd: 0 };
  }

  async reserve(usd: number, capUsd: number = CAPS.globalPerDayUsd): Promise<boolean> {
    const st = await this.state();
    if (remaining(st, capUsd, Date.now()) < usd) return false;
    await this.ctx.storage.put('global', charge(st, usd, Date.now()));
    return true;
  }

  async adjust(deltaUsd: number): Promise<void> {
    const st = await this.state();
    await this.ctx.storage.put('global', charge(st, deltaUsd, Date.now()));
  }

  async status(): Promise<{ spentUsd: number; capUsd: number; day: string }> {
    const st = await this.state();
    const day = dayKey(Date.now());
    return { spentUsd: st.day === day ? Number(st.spentUsd.toFixed(4)) : 0, capUsd: CAPS.globalPerDayUsd, day };
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
