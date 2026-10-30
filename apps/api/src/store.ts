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

export class Store {
  private maps = new Map<EntityName, Map<string, unknown>>();
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
    this.loaded = true;
  }

  get<K extends EntityName>(entity: K, id: string): EntityMap[K] | undefined {
    return this.maps.get(entity)!.get(id) as EntityMap[K] | undefined;
  }

  list<K extends EntityName>(entity: K): EntityMap[K][] {
    return [...this.maps.get(entity)!.values()] as EntityMap[K][];
  }

  async put<K extends EntityName>(entity: K, data: EntityMap[K] & { id: string }): Promise<EntityMap[K]> {
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
    await this.storage.delete(`${entity}:${id}`);
    this.emit({ type: 'remove', entity, id });
  }
}
