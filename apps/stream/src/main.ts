import { loadConfig } from './config.js';
import { ReplayDataSource } from './datasources/replay.js';
import { createMobulaDataSource } from './datasources/mobula/index.js';
import { createReconstructionDataSource } from './datasources/mobula/reconstruction.js';
import { MobulaRest } from './datasources/mobula/rest.js';
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

// Without a key, Mobula's keyless demo API (rate limited) still serves REST history for reconstructions.
const restBaseUrl = config.MOBULA_API_KEY ? config.MOBULA_REST_URL : 'https://demo-api.mobula.io';
const rest = new MobulaRest({ baseUrl: restBaseUrl, apiKey: config.MOBULA_API_KEY ?? '', rps: config.MOBULA_RPS });

const app = await buildServer({
  config,
  persistence,
  sources: {
    replay: new ReplayDataSource(),
    mobula: config.MOBULA_API_KEY ? createMobulaDataSource(config, rest) : null,
    reconstruction: createReconstructionDataSource(rest, restBaseUrl),
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
app.log.info({ persistence: persistence.kind, mobula: !!config.MOBULA_API_KEY, rest: restBaseUrl }, 'stream service up');
