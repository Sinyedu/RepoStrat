import {
  ChannelType,
  Collection,
  PermissionFlagsBits,
  type Client,
  type Guild,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { DiscordWorkspace } from '../src/discord/workspace.js';
import type { Project } from '../src/projects/types.js';

const guildId = '123456789012345678';
const roleId = '234567890123456789';
const userId = '345678901234567890';
const botId = '456789012345678901';

describe('Discord workspace creation', () => {
  it('creates a private category and forum with explicit permission overwrites', async () => {
    let nextId = 1;
    const create = vi.fn<
      (options: Record<string, unknown>) => Promise<{ id: string }>
    >(async () => ({ id: String(nextId++) }));
    const guild = {
      id: guildId,
      members: {
        fetchMe: vi.fn(async () => ({ permissions: { has: () => true } })),
        fetch: vi.fn(async () => ({
          roles: { cache: new Collection([[roleId, {}]]) },
        })),
      },
      roles: { fetch: vi.fn(async () => ({ id: roleId })) },
      channels: { fetch: vi.fn(async () => new Collection()), create },
    } as unknown as Guild;
    const client = {
      user: { id: botId },
      guilds: {
        cache: new Collection([[guildId, guild]]),
        fetch: vi.fn(async () => guild),
      },
    } as unknown as Client;
    const workspace = new DiscordWorkspace(client);
    const project = {
      guildId,
      githubRepositoryId: '100',
      owner: 'acme',
      name: 'private-widget',
      categoryId: null,
      issuesId: null,
    } as Project;

    await workspace.assertPermissions(guildId, true);
    await workspace.assertAudience(guildId, userId, roleId);
    const category = await workspace.ensureCategory(project, roleId);
    await workspace.ensureChannel(project, 'issuesId', category.id, roleId);

    expect(category.created).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      type: ChannelType.GuildCategory,
    });
    expect(create.mock.calls[1]?.[0]).toMatchObject({
      type: ChannelType.GuildForum,
      parent: category.id,
    });
    const overwrites = create.mock.calls[0]?.[0].permissionOverwrites;
    expect(overwrites).toEqual([
      { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
      { id: roleId, allow: [PermissionFlagsBits.ViewChannel] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel] },
    ]);
    expect(create.mock.calls[1]?.[0].permissionOverwrites).toEqual(overwrites);
    expect(client.guilds.fetch).not.toHaveBeenCalled();
  });

  it('rejects a guild missing from the bot cache without a REST guild fetch', async () => {
    const fetchGuild = vi.fn();
    const client = {
      guilds: { cache: new Collection(), fetch: fetchGuild },
    } as unknown as Client;
    const workspace = new DiscordWorkspace(client);
    await expect(
      workspace.assertPermissions(guildId, false),
    ).rejects.toMatchObject({ code: 'bot-not-in-guild' });
    expect(fetchGuild).not.toHaveBeenCalled();
  });

  it('does not substitute another cached guild for the requested guild ID', async () => {
    const otherGuild = { id: '999999999999999999' } as Guild;
    const client = {
      guilds: { cache: new Collection([[otherGuild.id, otherGuild]]) },
    } as unknown as Client;
    await expect(
      new DiscordWorkspace(client).assertPermissions(guildId, false),
    ).rejects.toMatchObject({ code: 'bot-not-in-guild' });
  });
});
