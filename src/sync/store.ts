import { and, eq, inArray } from 'drizzle-orm';
import type { openDatabase } from '../db/index.js';
import { syncedItems } from '../db/schema.js';
import type { ItemType } from './types.js';

type Database = ReturnType<typeof openDatabase>['db'];
export type Mapping = typeof syncedItems.$inferSelect;
export type NewMapping = Omit<Mapping, 'id'>;
export type MappingUpdate = Partial<
  Pick<
    Mapping,
    | 'channelId'
    | 'threadId'
    | 'starterMessageId'
    | 'contentHash'
    | 'githubUpdatedAt'
    | 'lastSyncedAt'
  >
>;

export const mappingKey = (type: ItemType, githubId: string) =>
  `${type}:${githubId}`;

export class SyncStore {
  constructor(private readonly db: Database) {}

  forRepository(guildId: string, repositoryId: string): Map<string, Mapping> {
    const rows = this.db
      .select()
      .from(syncedItems)
      .where(
        and(
          eq(syncedItems.guildId, guildId),
          eq(syncedItems.githubRepositoryId, repositoryId),
        ),
      )
      .all();
    return new Map(
      rows.map((r) => [mappingKey(r.itemType, r.githubItemId), r]),
    );
  }

  insert(row: NewMapping): Mapping {
    return this.db.insert(syncedItems).values(row).returning().get();
  }

  update(id: number, changes: MappingUpdate): void {
    this.db
      .update(syncedItems)
      .set(changes)
      .where(eq(syncedItems.id, id))
      .run();
  }

  /** Records a successful check for items that needed no Discord edit. */
  touch(ids: number[], at: Date): void {
    this.db.transaction((tx) => {
      for (let i = 0; i < ids.length; i += 500)
        tx.update(syncedItems)
          .set({ lastSyncedAt: at })
          .where(inArray(syncedItems.id, ids.slice(i, i + 500)))
          .run();
    });
  }
}
