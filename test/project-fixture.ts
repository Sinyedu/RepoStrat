import {
  ProjectError,
  type ChannelField,
  type GitHubGateway,
  type GitHubRepository,
  type Project,
  type WorkspaceGateway,
} from '../src/projects/types.js';
import { openDatabase } from '../src/db/index.js';
import { ProjectService } from '../src/projects/service.js';
import { ProjectStore } from '../src/projects/store.js';

const baseRepository: GitHubRepository = {
  id: '100',
  owner: 'acme',
  name: 'widget',
  url: 'https://github.com/acme/widget',
  visibility: 'public',
};

export class FakeWorkspace implements WorkspaceGateway {
  resources = new Map<
    string,
    { id: string; parentId: string | null; roleId: string | null }
  >();
  created = 0;
  removed: string[] = [];
  quarantined = false;
  failField: ChannelField | null = null;
  botAllowed = true;
  audienceAllowed = true;
  delayMs = 0;

  private key(project: Project, field: ChannelField) {
    return `${project.guildId}:${project.githubRepositoryId}:${field}`;
  }

  async assertPermissions(): Promise<void> {
    if (!this.botAllowed) throw new ProjectError('bot-permissions');
  }

  async assertAudience(): Promise<void> {
    if (!this.audienceAllowed) throw new ProjectError('audience-denied');
  }

  async canViewAudience(): Promise<boolean> {
    return this.audienceAllowed;
  }

  private async ensure(
    project: Project,
    field: ChannelField,
    parentId: string | null,
    roleId: string | null,
  ) {
    if (this.failField === field) {
      this.failField = null;
      throw new Error('Discord creation failed');
    }
    if (this.delayMs)
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const key = this.key(project, field);
    const existing = this.resources.get(key);
    if (existing) {
      existing.parentId = parentId;
      existing.roleId = roleId;
      return { id: existing.id, created: false };
    }
    const id = String(++this.created);
    this.resources.set(key, { id, parentId, roleId });
    return { id, created: true };
  }

  ensureCategory(project: Project, roleId: string | null) {
    return this.ensure(project, 'categoryId', null, roleId);
  }

  ensureChannel(
    project: Project,
    field: Exclude<ChannelField, 'categoryId'>,
    categoryId: string,
    roleId: string | null,
  ) {
    return this.ensure(project, field, categoryId, roleId);
  }

  async remove(_guildId: string, id: string): Promise<void> {
    this.removed.push(id);
    for (const [key, resource] of this.resources)
      if (resource.id === id) this.resources.delete(key);
  }

  async quarantine(): Promise<void> {
    this.quarantined = true;
  }

  async inspect(project: Project): Promise<string[]> {
    const fields: ChannelField[] = [
      'categoryId',
      'overviewId',
      'issuesId',
      'pullRequestsId',
      'activityId',
    ];
    return fields.filter(
      (field) =>
        this.resources.get(this.key(project, field))?.id !== project[field],
    );
  }
}

export function fixture() {
  const database = openDatabase('file::memory:');
  const store = new ProjectStore(database.db);
  const workspace = new FakeWorkspace();
  let repository = { ...baseRepository };
  let githubError: ProjectError | null = null;
  const github: GitHubGateway = {
    async getRepository() {
      if (githubError) throw githubError;
      return repository;
    },
  };
  const service = new ProjectService(store, github, workspace, '777');
  return {
    database,
    store,
    workspace,
    service,
    setRepository(value: Partial<GitHubRepository>) {
      repository = { ...repository, ...value };
    },
    setGitHubError(error: ProjectError | null) {
      githubError = error;
    },
  };
}
