import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createHttpServer } from '../src/http.js';

describe('GET /health', () => {
  it('returns success', async () => {
    const server = createHttpServer(pino({ level: 'silent' }));
    try {
      const response = await server.inject('/health');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    } finally {
      await server.close();
    }
  });
});
