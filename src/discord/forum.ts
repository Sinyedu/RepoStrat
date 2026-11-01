import {
  ChannelType,
  type APIEmbed,
  type Client,
  type ThreadChannel,
} from 'discord.js';
import { ProjectError } from '../projects/types.js';
import type { ForumGateway, ForumPost } from '../sync/types.js';
import { isMissing } from './errors.js';

const maxArchivedPages = 10;
// GitHub content is untrusted: never let a post ping anyone.
const allowedMentions = { parse: [] as never[] };

export class DiscordForum implements ForumGateway {
  constructor(private readonly client: Client) {}

  private guild(id: string) {
    const guild = this.client.guilds.cache.get(id);
    if (!guild) throw new ProjectError('bot-not-in-guild');
    return guild;
  }

  async createPost(guildId: string, forumId: string, post: ForumPost) {
    const forum = await this.guild(guildId).channels.fetch(forumId);
    if (forum?.type !== ChannelType.GuildForum)
      throw new ProjectError('discord-conflict');
    const thread = await forum.threads.create({
      name: post.name,
      message: {
        embeds: [post.embed as APIEmbed],
        allowedMentions,
      },
      reason: 'RepoStrat GitHub synchronization',
    });
    // In a forum post the starter message ID equals the thread ID.
    return { threadId: thread.id, starterMessageId: thread.id };
  }

  private async thread(
    guildId: string,
    forumId: string,
    threadId: string,
  ): Promise<ThreadChannel | null> {
    try {
      const channel = await this.guild(guildId).channels.fetch(threadId);
      return channel?.isThread() && channel.parentId === forumId
        ? channel
        : null;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async updatePost(
    guildId: string,
    forumId: string,
    threadId: string,
    post: ForumPost,
  ) {
    const thread = await this.thread(guildId, forumId, threadId);
    if (!thread) return 'missing';
    try {
      const starter = await thread.fetchStarterMessage();
      if (!starter) return 'missing';
      const wasArchived = thread.archived === true;
      if (wasArchived) await thread.setArchived(false);
      try {
        await starter.edit({
          embeds: [post.embed as APIEmbed],
          allowedMentions,
        });
        if (thread.name !== post.name) await thread.setName(post.name);
      } finally {
        if (wasArchived) await thread.setArchived(true).catch(() => undefined);
      }
      return 'updated';
    } catch (error) {
      if (isMissing(error)) return 'missing';
      throw error;
    }
  }

  async liveThreads(guildId: string, forumId: string, threadIds: string[]) {
    const wanted = new Set(threadIds);
    const live = new Set<string>();
    if (!wanted.size) return live;
    const forum = await this.guild(guildId).channels.fetch(forumId);
    if (forum?.type !== ChannelType.GuildForum)
      throw new ProjectError('discord-conflict');
    const active = await forum.threads.fetchActive();
    for (const id of active.threads.keys()) if (wanted.has(id)) live.add(id);
    let before: string | undefined;
    for (
      let page = 0;
      page < maxArchivedPages && live.size < wanted.size;
      page++
    ) {
      const archived = await forum.threads.fetchArchived({
        limit: 100,
        before,
      });
      for (const id of archived.threads.keys())
        if (wanted.has(id)) live.add(id);
      before = archived.threads.lastKey();
      if (!archived.hasMore || !before) break;
    }
    // Anything not listed (e.g. very old archived threads) is checked directly.
    for (const id of wanted)
      if (!live.has(id) && (await this.thread(guildId, forumId, id)))
        live.add(id);
    return live;
  }

  async deletePost(guildId: string, threadId: string): Promise<void> {
    const channel = await this.guild(guildId)
      .channels.fetch(threadId)
      .catch(() => null);
    if (channel?.isThread()) await channel.delete('Rolling back failed sync');
  }
}
