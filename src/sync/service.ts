import type { ProjectService } from '../projects/service.js';
import { ProjectError } from '../projects/types.js';
import { applyItems } from './apply.js';
import type { SyncStore } from './store.js';
import type {
  ForumGateway,
  ItemsGateway,
  SyncOutcome,
  SyncSummary,
} from './types.js';

export class SyncService {
  // Single-process control: one running sync per guild + repository.
  private readonly running = new Set<string>();

  constructor(
    private readonly projects: ProjectService,
    private readonly items: ItemsGateway,
    private readonly forum: ForumGateway,
    private readonly store: SyncStore,
    private readonly batchSize: number,
  ) {}

  async run(
    guildId: string,
    userId: string,
    path: string,
    onProgress?: (written: number) => void,
  ): Promise<SyncOutcome> {
    // Verifies GitHub access, audience, quarantine and Discord channels.
    const { project, problems } = await this.projects.sync(
      guildId,
      userId,
      path,
    );
    if (problems.length) return { project, problems, summary: null };
    if (
      project.status !== 'ready' ||
      !project.issuesId ||
      !project.pullRequestsId
    )
      throw new ProjectError('in-progress');

    const key = `${guildId}:${project.githubRepositoryId}`;
    if (this.running.has(key)) throw new ProjectError('sync-in-progress');
    this.running.add(key);
    try {
      // Fetch everything first: a GitHub failure must not touch any mapping.
      const [issues, pulls] = await Promise.all([
        this.items.listIssues(project.owner, project.name),
        this.items.listPullRequests(project.owner, project.name),
      ]);
      const summary: SyncSummary = {
        issuesImported: 0,
        pullRequestsImported: 0,
        updated: 0,
        recreated: 0,
        unchanged: 0,
        deferred: 0,
        truncated: issues.truncated || pulls.truncated,
        aborted: false,
        failures: [],
      };
      await applyItems(
        {
          guildId,
          repositoryId: project.githubRepositoryId,
          repositoryName: `${project.owner}/${project.name}`,
          forumIds: {
            issue: project.issuesId,
            pull_request: project.pullRequestsId,
          },
          mappings: this.store.forRepository(
            guildId,
            project.githubRepositoryId,
          ),
          store: this.store,
          forum: this.forum,
          batchSize: this.batchSize,
          onProgress,
        },
        [...issues.items, ...pulls.items],
        summary,
      );
      return { project, problems, summary };
    } finally {
      this.running.delete(key);
    }
  }
}
