import type { ProjectStore } from './store.js';
import {
  ProjectError,
  type ChannelField,
  type GitHubGateway,
  type Project,
  type WorkspaceGateway,
  type WorkspaceResult,
} from './types.js';

const childFields = [
  'overviewId',
  'issuesId',
  'pullRequestsId',
  'activityId',
] as const;
const pathPattern =
  /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9_.-]{1,100})$/;

function parsePath(path: string): { owner: string; name: string } {
  const match = pathPattern.exec(path);
  if (!match || match[2] === '.' || match[2] === '..')
    throw new ProjectError('invalid-name');
  return { owner: match[1]!, name: match[2]! };
}

export class ProjectService {
  constructor(
    private readonly store: ProjectStore,
    private readonly github: GitHubGateway,
    private readonly workspace: WorkspaceGateway,
    private readonly installationId: string,
  ) {}

  private async persist(
    project: Project,
    token: string,
    field: ChannelField,
    result: WorkspaceResult,
  ): Promise<Project> {
    try {
      return this.store.saveChannel(project.id, token, field, result.id);
    } catch (error) {
      if (result.created)
        await this.workspace
          .remove(project.guildId, result.id)
          .catch(() => undefined);
      throw error;
    }
  }

  async add(
    guildId: string,
    userId: string,
    path: string,
    requestedRoleId: string | null,
  ) {
    const { owner, name } = parsePath(path);
    const repository = await this.github.getRepository(owner, name);
    const existing = this.store.find(guildId, repository.id);
    const roleId = requestedRoleId ?? existing?.audienceRoleId ?? null;
    if (repository.visibility !== 'public' && !roleId) {
      if (existing) {
        this.store.refresh(existing.id, repository);
        await this.workspace.quarantine(existing);
      }
      throw new ProjectError('audience-required');
    }
    await this.workspace.assertPermissions(guildId, !!roleId);
    if (roleId) await this.workspace.assertAudience(guildId, userId, roleId);

    const claim = this.store.claim({
      guildId,
      installationId: this.installationId,
      repository,
      audienceRoleId: roleId,
    });
    if (!claim) throw new ProjectError('in-progress');

    let project = claim.project;
    try {
      const category = await this.workspace.ensureCategory(project, roleId);
      project = await this.persist(
        project,
        claim.token,
        'categoryId',
        category,
      );
      for (const field of childFields) {
        const result = await this.workspace.ensureChannel(
          project,
          field,
          project.categoryId!,
          roleId,
        );
        project = await this.persist(project, claim.token, field, result);
      }
      return this.store.finish(project.id, claim.token);
    } catch (error) {
      try {
        this.store.release(project.id, claim.token);
      } catch {
        // The lease expires after two minutes; a later invocation can recover.
      }
      throw error;
    }
  }

  async list(guildId: string, userId: string) {
    return Promise.all(
      this.store.list(guildId).map(async (project) => ({
        project,
        visible:
          project.visibility === 'public' && !project.audienceRoleId
            ? true
            : !!project.audienceRoleId &&
              (await this.workspace.canViewAudience(
                guildId,
                userId,
                project.audienceRoleId,
              )),
      })),
    );
  }

  async sync(guildId: string, userId: string, path: string) {
    const { owner, name } = parsePath(path);
    const repository = await this.github.getRepository(owner, name);
    const project = this.store.find(guildId, repository.id);
    if (!project) throw new ProjectError('not-registered');
    if (repository.visibility !== 'public' && !project.audienceRoleId) {
      this.store.refresh(project.id, repository);
      await this.workspace.quarantine(project);
      throw new ProjectError('audience-required');
    }
    if (project.audienceRoleId) {
      await this.workspace.assertAudience(
        guildId,
        userId,
        project.audienceRoleId,
      );
    }
    const problems = await this.workspace.inspect({
      ...project,
      visibility: repository.visibility,
    });
    this.store.refresh(project.id, repository);
    return {
      project: {
        ...project,
        owner: repository.owner,
        name: repository.name,
        htmlUrl: repository.url,
        visibility: repository.visibility,
      },
      problems,
    };
  }
}
