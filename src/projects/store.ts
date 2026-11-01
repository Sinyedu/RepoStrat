import { randomUUID } from 'node:crypto';
import { and, eq, isNull, lte, or } from 'drizzle-orm';
import type { openDatabase } from '../db/index.js';
import { guilds, repositories } from '../db/schema.js';
import {
  ProjectError,
  type ChannelField,
  type GitHubRepository,
  type Project,
} from './types.js';

type Database = ReturnType<typeof openDatabase>['db'];
type ClaimInput = {
  guildId: string;
  installationId: string;
  repository: GitHubRepository;
  audienceRoleId: string | null;
};

const leaseMs = 2 * 60 * 1000;

export class ProjectStore {
  constructor(private readonly db: Database) {}

  find(guildId: string, repositoryId: string): Project | undefined {
    return this.db
      .select()
      .from(repositories)
      .where(
        and(
          eq(repositories.guildId, guildId),
          eq(repositories.githubRepositoryId, repositoryId),
        ),
      )
      .get();
  }

  list(guildId: string): Project[] {
    return this.db
      .select()
      .from(repositories)
      .where(eq(repositories.guildId, guildId))
      .all();
  }

  claim(input: ClaimInput): { project: Project; token: string } | undefined {
    const now = new Date();
    const token = randomUUID();
    return this.db.transaction((tx) => {
      tx.insert(guilds)
        .values({ id: input.guildId, createdAt: now })
        .onConflictDoNothing()
        .run();
      tx.insert(repositories)
        .values({
          guildId: input.guildId,
          githubRepositoryId: input.repository.id,
          githubInstallationId: input.installationId,
          owner: input.repository.owner,
          name: input.repository.name,
          htmlUrl: input.repository.url,
          visibility: input.repository.visibility,
          audienceRoleId: input.audienceRoleId,
          createdAt: now,
        })
        .onConflictDoNothing()
        .run();
      const row = tx
        .select()
        .from(repositories)
        .where(
          and(
            eq(repositories.guildId, input.guildId),
            eq(repositories.githubRepositoryId, input.repository.id),
          ),
        )
        .get();
      if (!row) throw new Error('Repository claim was not created');
      if (row.claimUntil && row.claimUntil > now) return undefined;
      const project = tx
        .update(repositories)
        .set({
          owner: input.repository.owner,
          name: input.repository.name,
          htmlUrl: input.repository.url,
          visibility: input.repository.visibility,
          githubInstallationId: input.installationId,
          audienceRoleId: input.audienceRoleId,
          status: 'pending',
          claimToken: token,
          claimUntil: new Date(now.getTime() + leaseMs),
        })
        .where(
          and(
            eq(repositories.id, row.id),
            or(
              isNull(repositories.claimUntil),
              lte(repositories.claimUntil, now),
            ),
          ),
        )
        .returning()
        .get();
      return project ? { project, token } : undefined;
    });
  }

  saveChannel(
    id: number,
    token: string,
    field: ChannelField,
    channelId: string,
  ): Project {
    const row = this.db
      .update(repositories)
      .set({ [field]: channelId, claimUntil: new Date(Date.now() + leaseMs) })
      .where(and(eq(repositories.id, id), eq(repositories.claimToken, token)))
      .returning()
      .get();
    if (!row) throw new ProjectError('in-progress');
    return row;
  }

  finish(id: number, token: string): Project {
    const current = this.db
      .select({ registeredAt: repositories.registeredAt })
      .from(repositories)
      .where(and(eq(repositories.id, id), eq(repositories.claimToken, token)))
      .get();
    if (!current) throw new ProjectError('in-progress');
    const row = this.db
      .update(repositories)
      .set({
        status: 'ready',
        claimToken: null,
        claimUntil: null,
        registeredAt: current.registeredAt ?? new Date(),
      })
      .where(and(eq(repositories.id, id), eq(repositories.claimToken, token)))
      .returning()
      .get();
    if (!row) throw new ProjectError('in-progress');
    return row;
  }

  release(id: number, token: string): void {
    this.db
      .update(repositories)
      .set({ claimToken: null, claimUntil: null })
      .where(and(eq(repositories.id, id), eq(repositories.claimToken, token)))
      .run();
  }

  refresh(id: number, repository: GitHubRepository): void {
    this.db
      .update(repositories)
      .set({
        owner: repository.owner,
        name: repository.name,
        htmlUrl: repository.url,
        visibility: repository.visibility,
      })
      .where(eq(repositories.id, id))
      .run();
  }
}
