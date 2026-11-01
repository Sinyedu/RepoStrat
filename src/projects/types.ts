export type Visibility = 'public' | 'private' | 'internal' | 'unknown';
export type ChannelField =
  'categoryId' | 'overviewId' | 'issuesId' | 'pullRequestsId' | 'activityId';

export type GitHubRepository = {
  id: string;
  owner: string;
  name: string;
  url: string;
  visibility: Visibility;
};

export type Project = {
  id: number;
  guildId: string;
  githubRepositoryId: string;
  githubInstallationId: string;
  owner: string;
  name: string;
  htmlUrl: string | null;
  visibility: Visibility;
  audienceRoleId: string | null;
  categoryId: string | null;
  overviewId: string | null;
  issuesId: string | null;
  pullRequestsId: string | null;
  activityId: string | null;
  status: 'pending' | 'ready';
  registeredAt: Date | null;
};

export type WorkspaceResult = { id: string; created: boolean };

export interface WorkspaceGateway {
  assertPermissions(guildId: string, restricted: boolean): Promise<void>;
  assertAudience(
    guildId: string,
    userId: string,
    roleId: string,
  ): Promise<void>;
  canViewAudience(
    guildId: string,
    userId: string,
    roleId: string,
  ): Promise<boolean>;
  ensureCategory(
    project: Project,
    audienceRoleId: string | null,
  ): Promise<WorkspaceResult>;
  ensureChannel(
    project: Project,
    field: Exclude<ChannelField, 'categoryId'>,
    categoryId: string,
    audienceRoleId: string | null,
  ): Promise<WorkspaceResult>;
  remove(guildId: string, channelId: string): Promise<void>;
  quarantine(project: Project): Promise<void>;
  inspect(project: Project): Promise<string[]>;
}

export interface GitHubGateway {
  getRepository(owner: string, name: string): Promise<GitHubRepository>;
}

export class ProjectError extends Error {
  constructor(
    readonly code:
      | 'invalid-name'
      | 'github-unavailable'
      | 'github-denied'
      | 'github-rate-limit'
      | 'github-not-configured'
      | 'audience-required'
      | 'audience-denied'
      | 'bot-permissions'
      | 'in-progress'
      | 'discord-conflict'
      | 'not-registered',
  ) {
    super(code);
  }
}
