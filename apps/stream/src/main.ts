import { loadConfig } from './config.js';
import { ReplayDataSource } from './datasources/replay.js';
import { createMobulaDataSource } from './datasources/mobula/index.js';
import { MemoryPersistence } from './persistence/memory.js';
import { PostgresPersistence } from './persistence/postgres.js';
import type { Persistence } from './persistence/types.js';
import { buildServer } from './server.js';

const config = loadConfig();

let persistence: Persistence = new MemoryPersistence();
if (config.DATABASE_URL) {
  const pg = new PostgresPersistence(config.DATABASE_URL);
  if (await pg.ping()) persistence = pg;
  else { console.warn('[stream] DATABASE_URL set but unreachable; running in memory'); await pg.close(); }
}

const app = await buildServer({
  config,
  persistence,
  sources: {
    replay: new ReplayDataSource(),
    mobula: config.MOBULA_API_KEY ? createMobulaDataSource(config) : null,
  },
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.PORT, host: config.HOST });
app.log.info({ persistence: persistence.kind, mobula: !!config.MOBULA_API_KEY }, 'stream service up');
