import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().int().min(0).default(4010),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().optional(),
  MOBULA_API_KEY: z.string().optional(),
  MOBULA_REST_URL: z.string().url().default('https://api.mobula.io'),
  MOBULA_WSS_URL: z.string().default('wss://api.mobula.io'),
  MOBULA_EVM_STREAM_URL: z.string().default('wss://stream-evm-prod.mobula.io/'),
  MOBULA_SOL_STREAM_URL: z.string().default('wss://stream-sol-prod.mobula.io/'),
  MOBULA_RPS: z.coerce.number().positive().default(1),
  SERVICE_VERSION: z.string().default('0.1.0'),
  /** When set, ended live sessions are written here as replay files with live-witnessed provenance. */
  CAPTURE_DIR: z.string().optional(),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return Env.parse(env);
}
