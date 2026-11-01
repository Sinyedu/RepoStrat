import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildBasedChannel,
} from 'discord.js';
import {
  ProjectError,
  type ChannelField,
  type Project,
  type WorkspaceGateway,
} from '../projects/types.js';
import { isMissing } from './errors.js';

const channels = {
  overviewId: { name: 'overview', type: ChannelType.GuildText },
  issuesId: { name: 'issues', type: ChannelType.GuildForum },
  pullRequestsId: { name: 'pull-requests', type: ChannelType.GuildForum },
  activityId: { name: 'activity', type: ChannelType.GuildText },
} as const;
type ChildField = Exclude<ChannelField, 'categoryId'>;

function categoryName(project: Project): string {
  const suffix = `-${project.githubRepositoryId}`;
  return (
    `${project.owner}-${project.name}`.slice(0, 100 - suffix.length) + suffix
  );
}

export class DiscordWorkspace implements WorkspaceGateway {
  constructor(private readonly client: Client) {}

  private async guild(id: string): Promise<Guild> {
    const guild = this.client.guilds.cache.get(id);
    if (!guild) throw new ProjectError('bot-not-in-guild');
    return guild;
  }

  private async channel(
    guild: Guild,
    id: string | null,
  ): Promise<GuildBasedChannel | null> {
    if (!id) return null;
    try {
      return await guild.channels.fetch(id);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  private overwrites(guild: Guild, roleId: string) {
    const botId = this.client.user?.id;
    if (!botId) throw new ProjectError('bot-permissions');
    return [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: roleId, allow: [PermissionFlagsBits.ViewChannel] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel] },
    ];
  }

  async assertPermissions(guildId: string, restricted: boolean): Promise<void> {
    const guild = await this.guild(guildId);
    const member = await guild.members.fetchMe();
    const required = [
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ViewChannel,
    ];
    if (restricted) required.push(PermissionFlagsBits.ManageRoles);
    if (!member.permissions.has(required))
      throw new ProjectError('bot-permissions');
  }

  async assertAudience(
    guildId: string,
    userId: string,
    roleId: string,
  ): Promise<void> {
    const guild = await this.guild(guildId);
    const role = await guild.roles.fetch(roleId);
    if (!role || role.id === guild.id)
      throw new ProjectError('audience-denied');
    const member = await guild.members.fetch(userId);
    if (!member.roles.cache.has(roleId))
      throw new ProjectError('audience-denied');
  }

  async canViewAudience(
    guildId: string,
    userId: string,
    roleId: string,
  ): Promise<boolean> {
    try {
      await this.assertAudience(guildId, userId, roleId);
      return true;
    } catch {
      return false;
    }
  }

  async ensureCategory(project: Project, roleId: string | null) {
    const guild = await this.guild(project.guildId);
    let category = await this.channel(guild, project.categoryId);
    if (!category) {
      const all = await guild.channels.fetch();
      category =
        all.find(
          (item) =>
            item?.type === ChannelType.GuildCategory &&
            item.name === categoryName(project),
        ) ?? null;
    }
    if (category && category.type !== ChannelType.GuildCategory)
      throw new ProjectError('discord-conflict');
    if (category) {
      if (roleId)
        await category.permissionOverwrites.set(this.overwrites(guild, roleId));
      return { id: category.id, created: false };
    }
    const created = await guild.channels.create({
      name: categoryName(project),
      type: ChannelType.GuildCategory,
      ...(roleId
        ? { permissionOverwrites: this.overwrites(guild, roleId) }
        : {}),
    });
    return { id: created.id, created: true };
  }

  async ensureChannel(
    project: Project,
    field: ChildField,
    categoryId: string,
    roleId: string | null,
  ) {
    const guild = await this.guild(project.guildId);
    const spec = channels[field];
    let channel = await this.channel(guild, project[field]);
    if (!channel) {
      const all = await guild.channels.fetch();
      channel =
        all.find(
          (item) => item?.parentId === categoryId && item.name === spec.name,
        ) ?? null;
    }
    if (channel && channel.type !== spec.type)
      throw new ProjectError('discord-conflict');
    if (channel) {
      if (channel.parentId !== categoryId)
        await channel.setParent(categoryId, { lockPermissions: !!roleId });
      else if (roleId && channel.permissionsLocked !== true)
        await channel.lockPermissions();
      return { id: channel.id, created: false };
    }
    const created = await guild.channels.create({
      name: spec.name,
      type: spec.type,
      parent: categoryId,
      ...(roleId
        ? { permissionOverwrites: this.overwrites(guild, roleId) }
        : {}),
    });
    return { id: created.id, created: true };
  }

  async remove(guildId: string, channelId: string): Promise<void> {
    const guild = await this.guild(guildId);
    const channel = await this.channel(guild, channelId);
    if (channel) await channel.delete();
  }

  async quarantine(project: Project): Promise<void> {
    const guild = await this.guild(project.guildId);
    const botId = this.client.user?.id;
    if (!botId) throw new ProjectError('bot-permissions');
    const overwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel] },
    ];
    const category = await this.channel(guild, project.categoryId);
    if (category?.type === ChannelType.GuildCategory)
      await category.permissionOverwrites.set(overwrites);
    for (const field of Object.keys(channels) as ChildField[]) {
      const channel = await this.channel(guild, project[field]);
      if (
        channel?.type === ChannelType.GuildText ||
        channel?.type === ChannelType.GuildForum
      )
        await channel.permissionOverwrites.set(overwrites);
    }
  }

  async inspect(project: Project): Promise<string[]> {
    const guild = await this.guild(project.guildId);
    const missing: string[] = [];
    const category = await this.channel(guild, project.categoryId);
    if (!category || category.type !== ChannelType.GuildCategory)
      missing.push('category');
    if (
      category?.type === ChannelType.GuildCategory &&
      project.audienceRoleId
    ) {
      const everyone = category.permissionOverwrites.cache.get(guild.id);
      const audience = category.permissionOverwrites.cache.get(
        project.audienceRoleId,
      );
      if (
        !everyone?.deny.has(PermissionFlagsBits.ViewChannel) ||
        !audience?.allow.has(PermissionFlagsBits.ViewChannel)
      )
        missing.push('private permissions');
    } else if (project.visibility !== 'public' && !project.audienceRoleId) {
      missing.push('private audience');
    }
    for (const field of Object.keys(channels) as ChildField[]) {
      const channel = await this.channel(guild, project[field]);
      if (
        !channel ||
        channel.type !== channels[field].type ||
        channel.parentId !== category?.id
      ) {
        missing.push(channels[field].name);
      } else if (project.audienceRoleId && channel.permissionsLocked !== true) {
        missing.push(`${channels[field].name} permissions`);
      }
    }
    return missing;
  }
}
