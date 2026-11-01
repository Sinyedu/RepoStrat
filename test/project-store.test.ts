import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import { ProjectStore } from '../src/projects/store.js';
import { ProjectService } from '../src/projects/service.js';
import { FakeWorkspace } from './project-fixture.js';

const repository = {
  id: '987654321',
  owner: 'acme',
  name: 'widget',
  url: 'https://github.com/acme/widget',
  visibility: 'public' as const,
};
const guildId = '123456789012345678';
const userId = '234567890123456789';

describe('project persistence and restart recovery', () => {
  it('keeps mappings after reopening SQLite and reuses the workspace', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'repostrat-project-test-'));
    const url = `file:${join(directory, 'projects.db')}`;
    const workspace = new FakeWorkspace();
    const github = { getRepository: async () => repository };
    try {
      const firstDb = openDatabase(url);
      const first = await new ProjectService(
        new ProjectStore(firstDb.db),
        github,
        workspace,
        '777',
      ).add(guildId, userId, 'acme/widget', null);
      firstDb.close();

      const secondDb = openDatabase(url);
      try {
        const store = new ProjectStore(secondDb.db);
        expect(store.find(guildId, repository.id)?.categoryId).toBe(
          first.categoryId,
        );
        const repeated = await new ProjectService(
          store,
          github,
          workspace,
          '777',
        ).add(guildId, userId, 'acme/widget', null);
        expect(repeated.categoryId).toBe(first.categoryId);
        expect(workspace.created).toBe(5);
      } finally {
        secondDb.close();
      }
    } finally {
      if (resolve(directory).startsWith(resolve(tmpdir()) + sep)) {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });

  it('reclaims an expired registration after a simulated crash', async () => {
    const database = openDatabase('file::memory:');
    try {
      const store = new ProjectStore(database.db);
      const claim = store.claim({
        guildId,
        installationId: '777',
        repository,
        audienceRoleId: null,
      });
      expect(claim).toBeDefined();
      database.sqlite.prepare('UPDATE repositories SET claim_until = ?').run(1);
      const workspace = new FakeWorkspace();
      const service = new ProjectService(
        store,
        { getRepository: async () => repository },
        workspace,
        '777',
      );
      const result = await service.add(guildId, userId, 'acme/widget', null);
      expect(result.status).toBe('ready');
      expect(store.list(guildId)).toHaveLength(1);
    } finally {
      database.close();
    }
  });
});
