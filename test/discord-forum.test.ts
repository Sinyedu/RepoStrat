import { ChannelType, Collection, type Client } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { DiscordForum } from '../src/discord/forum.js';

const guildId = '123456789012345678';
const forumId = '223456789012345678';
const post = { name: '#1 — Title', embed: { title: 'Title' } };

function setup(thread: Record<string, unknown> | null = null) {
  const create = vi.fn(async () => ({ id: '999' }));
  const forum = {
    type: ChannelType.GuildForum,
    threads: {
      create,
      fetchActive: vi.fn(async () => ({
        threads: new Collection([['10', {}]]),
      })),
      fetchArchived: vi.fn(async () => ({
        threads: new Collection([['11', {}]]),
        hasMore: false,
      })),
    },
  };
  const fetch = vi.fn(async (id: string) => {
    if (id === forumId) return forum;
    if (thread && id === '500') return thread;
    throw Object.assign(new Error('Unknown Channel'), { code: 10003 });
  });
  const client = {
    guilds: { cache: new Collection([[guildId, { channels: { fetch } }]]) },
  } as unknown as Client;
  return {
    forum: new DiscordForum(client),
    create,
    fetch,
    forumChannel: forum,
  };
}

describe('Discord forum adapter', () => {
  it('creates a post that cannot mention anyone', async () => {
    const { forum, create } = setup();
    await expect(forum.createPost(guildId, forumId, post)).resolves.toEqual({
      threadId: '999',
      starterMessageId: '999',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: post.name,
        message: { embeds: [post.embed], allowedMentions: { parse: [] } },
      }),
    );
  });

  it('edits the starter message, renames, and keeps archive state', async () => {
    const edit = vi.fn();
    const setArchived = vi.fn(async () => undefined);
    const setName = vi.fn();
    const { forum } = setup({
      isThread: () => true,
      parentId: forumId,
      name: 'old',
      archived: true,
      fetchStarterMessage: async () => ({ edit }),
      setArchived,
      setName,
    });
    await expect(forum.updatePost(guildId, forumId, '500', post)).resolves.toBe(
      'updated',
    );
    expect(edit).toHaveBeenCalledWith({
      embeds: [post.embed],
      allowedMentions: { parse: [] },
    });
    expect(setName).toHaveBeenCalledWith(post.name);
    expect(setArchived.mock.calls).toEqual([[false], [true]]);
  });

  it('reports a deleted thread, a deleted starter, and a moved thread as missing', async () => {
    const { forum } = setup();
    await expect(forum.updatePost(guildId, forumId, '404', post)).resolves.toBe(
      'missing',
    );
    const noStarter = setup({
      isThread: () => true,
      parentId: forumId,
      fetchStarterMessage: async () => null,
    });
    await expect(
      noStarter.forum.updatePost(guildId, forumId, '500', post),
    ).resolves.toBe('missing');
    const moved = setup({
      isThread: () => true,
      parentId: 'other',
      fetchStarterMessage: async () => ({ edit: vi.fn() }),
    });
    await expect(
      moved.forum.updatePost(guildId, forumId, '500', post),
    ).resolves.toBe('missing');
  });

  it('propagates other Discord failures', async () => {
    const { forum } = setup({
      isThread: () => true,
      parentId: forumId,
      archived: false,
      name: post.name,
      fetchStarterMessage: async () => ({
        edit: async () => {
          throw Object.assign(new Error('Missing Permissions'), {
            code: 50013,
          });
        },
      }),
    });
    await expect(
      forum.updatePost(guildId, forumId, '500', post),
    ).rejects.toMatchObject({ code: 50013 });
  });

  it('finds live threads with listings plus direct checks', async () => {
    const { forum, fetch } = setup({
      isThread: () => true,
      parentId: forumId,
    });
    const live = await forum.liveThreads(guildId, forumId, [
      '10',
      '11',
      '500',
      '404',
    ]);
    expect([...live].sort()).toEqual(['10', '11', '500']);
    // One direct fetch for the forum plus two unlisted threads, not N calls.
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('fails when the forum channel is not a forum', async () => {
    const client = {
      guilds: {
        cache: new Collection([
          [
            guildId,
            {
              channels: {
                fetch: async () => ({ type: ChannelType.GuildText }),
              },
            },
          ],
        ]),
      },
    } as unknown as Client;
    await expect(
      new DiscordForum(client).createPost(guildId, forumId, post),
    ).rejects.toMatchObject({ code: 'discord-conflict' });
  });
});
