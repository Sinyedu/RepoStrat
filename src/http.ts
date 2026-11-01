import Fastify from 'fastify';
import type { Logger } from 'pino';

export function createHttpServer(logger: Logger) {
  const server = Fastify({ loggerInstance: logger });
  server.get('/health', async () => ({ status: 'ok' }));
  return server;
}
