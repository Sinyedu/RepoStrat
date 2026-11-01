import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export function databaseFile(url: string): string {
  if (!url.startsWith('file:') || url.length <= 5) {
    throw new Error('DATABASE_URL must be a nonempty file: path');
  }
  const file = url.slice(5);
  return file === ':memory:' ? file : resolve(file);
}

export function openDatabase(
  url: string,
  migrationsFolder = resolve('drizzle'),
) {
  const file = databaseFile(url);
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  try {
    sqlite.pragma('foreign_keys = ON');
    if (file !== ':memory:') sqlite.pragma('journal_mode = WAL');
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder });
    return { db, sqlite, close: () => sqlite.close() };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
