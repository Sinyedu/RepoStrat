import 'dotenv/config';
import { z } from 'zod';

const snowflake = z
  .string()
  .regex(/^\d{17,20}$/, 'must be a Discord snowflake');

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: snowflake,
  DISCORD_GUILD_ID: snowflake,
  DATABASE_URL: z.string().min(1).default('file:./data/repostrat.db'),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_INSTALLATION_ID: z.string().optional(),
  GITHUB_PRIVATE_KEY_PATH: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function parseConfig(input: NodeJS.ProcessEnv): Config {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.'));
    throw new Error(
      `Invalid environment variables: ${[...new Set(fields)].join(', ')}`,
    );
  }
  const config = result.data;
  if (
    !config.DATABASE_URL.startsWith('file:') ||
    config.DATABASE_URL.length <= 5
  ) {
    throw new Error('DATABASE_URL must be a nonempty file: path');
  }
  return config;
}
