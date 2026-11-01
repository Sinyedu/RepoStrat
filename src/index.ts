import { startApplication } from './app.js';
import { parseConfig } from './config.js';

try {
  const app = await startApplication(parseConfig(process.env));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.stop().catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
      });
    });
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
