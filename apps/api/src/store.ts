// In-memory entity store backed by Durable Object storage, with change fan-out.

import type { CaddieCard, ContentItem, EntityName, InboxItem, Moment, PracticeAttempt, ServerEvent, Session, SkillObservation } from '../../../packages/contracts/index.ts';

export interface EntityMap {
  session: Session;
  moment: Moment;
  card: CaddieCard;
  content: ContentItem;
  practice: PracticeAttempt;
  inbox: InboxItem;
  skill: SkillObservation;
}

const ENTITIES: EntityName[] = ['session', 'moment', 'card', 'content', 'practice', 'inbox', 'skill'];

/** Which session an entity belongs to, so writes for a deleted session are refused. */
function sessionOf(entity: EntityName, data: Record<string, unknown>): string | null {
  if (entity === 'moment') return ((data.work as { sessionId?: string } | undefined)?.sessionId) ?? null;
  if (entity === 'content' || entity === 'card' || entity === 'practice') return (data.sessionId as string | null | undefined) ?? null;
  return null;
}

/**
 * Removal leaves a durable tombstone. A late write (e.g. a model response that
 * finishes after the user deleted the session) for a removed entity, or one that
 * would create a new entity for a removed session or moment, is refused, so
 * deleted user content can never reappear.
 */
export class Store {
  private maps = new Map<EntityName, Map<string, unknown>>();
  private tombs = new Set<string>();
  private loaded = false;
  private readonly storage: DurableObjectStorage;
  private readonly emit: (e: ServerEvent) => void;

  constructor(storage: DurableObjectStorage, emit: (e: ServerEvent) => void) {
    this.storage = storage;
    this.emit = emit;
    for (const e of ENTITIES) this.maps.set(e, new Map());
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    for (const e of ENTITIES) {
      const rows = await this.storage.list<unknown>({ prefix: `${e}:` });
      const map = this.maps.get(e)!;
      for (const [k, v] of rows) map.set(k.slice(e.length + 1), v);
    }
    const tombs = await this.storage.list<number>({ prefix: 'tomb:' });
    for (const k of tombs.keys()) this.tombs.add(k.slice(5));
    this.loaded = true;
  }

  /** True when the entity exists and was not removed. */
  alive(entity: EntityName, id: string | null | undefined): boolean {
    return !!id && this.maps.get(entity)!.has(id) && !this.tombs.has(`${entity}:${id}`);
  }

  private refused(entity: EntityName, data: Record<string, unknown> & { id: string }): boolean {
    if (this.tombs.has(`${entity}:${data.id}`)) return true;
    // Entities deliberately kept after a session is deleted (an approved card) can still be
    // updated (revoked, edited); only new entities for a removed session or moment are refused.
    if (this.maps.get(entity)!.has(data.id)) return false;
    const sid = sessionOf(entity, data);
    if (sid && this.tombs.has(`session:${sid}`)) return true;
    if (entity === 'skill' && typeof data.momentId === 'string' && this.tombs.has(`moment:${data.momentId}`)) return true;
    return false;
  }

  get<K extends EntityName>(entity: K, id: string): EntityMap[K] | undefined {
    return this.maps.get(entity)!.get(id) as EntityMap[K] | undefined;
  }

  list<K extends EntityName>(entity: K): EntityMap[K][] {
    return [...this.maps.get(entity)!.values()] as EntityMap[K][];
  }

  async put<K extends EntityName>(entity: K, data: EntityMap[K] & { id: string }): Promise<EntityMap[K]> {
    if (this.refused(entity, data as unknown as Record<string, unknown> & { id: string })) return data;
    this.maps.get(entity)!.set(data.id, data);
    await this.storage.put(`${entity}:${data.id}`, data);
    this.emit({ type: 'upsert', entity, data } as ServerEvent);
    return data;
  }

  async update<K extends EntityName>(entity: K, id: string, fn: (d: EntityMap[K]) => EntityMap[K]): Promise<EntityMap[K] | undefined> {
    const cur = this.get(entity, id);
    if (!cur) return undefined;
    return this.put(entity, fn(structuredClone(cur)) as EntityMap[K] & { id: string });
  }

  async remove(entity: EntityName, id: string): Promise<void> {
    this.maps.get(entity)!.delete(id);
    this.tombs.add(`${entity}:${id}`);
    await this.storage.delete(`${entity}:${id}`);
    await this.storage.put(`tomb:${entity}:${id}`, Date.now());
    this.emit({ type: 'remove', entity, id });
  }
}
