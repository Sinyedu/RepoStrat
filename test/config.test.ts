import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';

const valid = {
  DISCORD_TOKEN: 'secret-do-not-print',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_GUILD_ID: '234567890123456789',
  DATABASE_URL: 'file:./data/test.db',
};

describe('environment validation', () => {
  it('accepts Discord-only configuration and empty GitHub settings', () => {
    const config = parseConfig({ ...valid, GITHUB_WEBHOOK_SECRET: '' });
    expect(config.PORT).toBe(3000);
    expect(config.GITHUB_WEBHOOK_SECRET).toBe('');
  });

  it('reports invalid variable names without exposing values', () => {
    expect(() =>
      parseConfig({ ...valid, DISCORD_CLIENT_ID: 'bad', PORT: '0' }),
    ).toThrow(/PORT.*DISCORD_CLIENT_ID/);
    try {
      parseConfig({ ...valid, DISCORD_CLIENT_ID: 'bad' });
    } catch (error) {
      expect(String(error)).not.toContain(valid.DISCORD_TOKEN);
    }
  });

  it('rejects a non-file database URL', () => {
    expect(() =>
      parseConfig({ ...valid, DATABASE_URL: 'https://example.com/db' }),
    ).toThrow('DATABASE_URL');
  });
});
