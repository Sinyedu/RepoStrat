import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/index.js';

describe('database initialization', () => {
  it('runs migrations and enforces relationships', () => {
    const database = openDatabase('file::memory:');
    try {
      const names = database.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[];
      expect(names.map((row) => row.name)).toContain('guilds');
      expect(names.map((row) => row.name)).toContain('repositories');
      expect(() =>
        database.sqlite
          .prepare(
            'INSERT INTO repositories (guild_id, github_repository_id, owner, name, github_installation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run('123456789012345678', '999', 'acme', 'widget', '777', 1),
      ).toThrow();
    } finally {
      database.close();
    }
  });
});
