import { EventEmitter } from 'node:events';
import type { Client } from 'discord.js';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { startApplication } from '../src/app.js';
import { parseConfig } from '../src/config.js';
import type { openDatabase } from '../src/db/index.js';

const config = parseConfig({
  DISCORD_TOKEN: 'test-token',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_GUILD_ID: '234567890123456789',
  DATABASE_URL: 'file::memory:',
  LOG_LEVEL: 'error',
});

function dependencies(loginSucceeds = true) {
  const client = Object.assign(new EventEmitter(), {
    login: vi
      .fn()
      .mockImplementation(() =>
        loginSucceeds
          ? Promise.resolve('test-token')
          : Promise.reject(new Error('login failed')),
      ),
    destroy: vi.fn().mockResolvedValue(undefined),
  }) as unknown as Client;
  const server = {
    listen: vi.fn().mockResolvedValue('http://localhost'),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as FastifyInstance;
  const database = { close: vi.fn() } as unknown as ReturnType<
    typeof openDatabase
  >;
  return { client, server, database };
}

describe('application lifecycle', () => {
  it('shuts down resources exactly once', async () => {
    const deps = dependencies();
    const app = await startApplication(config, deps);
    await Promise.all([app.stop(), app.stop()]);
    expect(deps.client.destroy).toHaveBeenCalledOnce();
    expect(deps.server.close).toHaveBeenCalledOnce();
    expect(deps.database.close).toHaveBeenCalledOnce();
  });

  it('cleans up if Discord login fails', async () => {
    const deps = dependencies(false);
    await expect(startApplication(config, deps)).rejects.toThrow(
      'login failed',
    );
    expect(deps.server.close).toHaveBeenCalledOnce();
    expect(deps.client.destroy).toHaveBeenCalledOnce();
    expect(deps.database.close).toHaveBeenCalledOnce();
  });
});
