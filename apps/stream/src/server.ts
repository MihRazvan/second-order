import cors from '@fastify/cors';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { CreateSessionRequest, type ApiError, type HealthResponse, type SessionSnapshot, type SseFrame } from '@second-order/contracts';
import { listReplays, loadReplay } from '@second-order/replays';
import type { Config } from './config.js';
import type { DataSource } from './datasources/types.js';
import type { Persistence } from './persistence/types.js';
import { SessionManager } from './sessions.js';

export interface ServerDeps {
  config: Config;
  persistence: Persistence;
  sources: Record<'replay' | 'mobula' | 'reconstruction', DataSource | null>;
}

const HEARTBEAT_MS = 5000;

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: deps.config.LOG_LEVEL }, logController: new LogController({ disableRequestLogging: true }) });
  const startedAt = Date.now();
  const sessions = new SessionManager(deps.sources, deps.persistence, app.log, 50, deps.config.CAPTURE_DIR);

  await app.register(cors, { origin: deps.config.CORS_ORIGIN.split(',').map((s) => s.trim()) });

  // Never leak stack traces or secrets.
  app.setErrorHandler((err: Error & { status?: number; statusCode?: number; code?: string }, _req, reply) => {
    const status = err.status ?? err.statusCode ?? 500;
    const code = err.code ?? (status === 500 ? 'INTERNAL' : 'REQUEST_FAILED');
    if (status >= 500 && code === 'INTERNAL') app.log.error({ err }, 'request failed');
    else if (status >= 500) app.log.warn({ code, status }, err.message);
    const body: ApiError = { error: { code, message: status >= 500 ? 'Internal error' : err.message } };
    reply.status(status).send(body);
  });

  app.get('/health', async (): Promise<HealthResponse> => {
    const dbOk = await deps.persistence.ping();
    return {
      status: dbOk ? 'ok' : 'degraded',
      service: 'stream',
      version: deps.config.SERVICE_VERSION,
      uptimeMs: Date.now() - startedAt,
      persistence: deps.persistence.kind,
      providers: { replay: deps.sources.replay ? 'ready' : 'disabled', mobula: deps.sources.mobula ? 'ready' : 'disabled', reconstruction: deps.sources.reconstruction ? 'ready' : 'disabled' },
      sessions: sessions.count(),
    };
  });

  app.get('/ready', async (_req, reply) => {
    const ok = await deps.persistence.ping();
    reply.status(ok ? 200 : 503).send({ ready: ok });
  });

  app.get('/api/replays', async () => ({ v: 1, replays: listReplays() }));

  /** Events at the fixture origin (the tracked wallet's context before the crash test starts). */
  app.get<{ Params: { id: string } }>('/api/replays/:id/context', async (req, reply) => {
    const file = loadReplay(req.params.id);
    if (!file) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Replay not found' } } satisfies ApiError);
    return { v: 1, manifest: file.manifest, events: file.events.filter((e) => e.at === 0 && e.type !== 'stream.status') };
  });

  app.get('/api/capabilities', async () => {
    const out: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(deps.sources)) out[k] = s ? await s.capabilities() : { provider: k, capabilities: {}, checkedAt: new Date().toISOString(), disabled: true };
    return { v: 1, providers: out };
  });

  app.post('/api/sessions', async (req, reply) => {
    const parsed = CreateSessionRequest.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.issues.map((i) => i.message).join('; ') } } satisfies ApiError);
    const s = await sessions.create(parsed.data);
    return reply.status(201).send(s.info);
  });

  app.get('/api/sessions', async () => ({ v: 1, sessions: sessions.list() }));

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
    const s = sessions.get(req.params.id);
    if (!s) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Session not found' } } satisfies ApiError);
    return s.info;
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id/snapshot', async (req, reply) => {
    const s = sessions.get(req.params.id);
    if (s) {
      const body: SessionSnapshot = { v: 1, session: s.info, events: s.events, serverTime: Date.now() };
      return body;
    }
    // Not in memory (restart, eviction): rebuild from persistence so reports outlive the process.
    const events = await deps.persistence.listEvents(req.params.id);
    if (events.length === 0) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Session not found' } } satisfies ApiError);
    const first = events[0]!;
    const mode = first.provenance.kind === 'demo-scenario' ? 'replay' : first.provenance.kind === 'live-witnessed' ? 'live' : 'reconstruction';
    const body: SessionSnapshot = {
      v: 1,
      session: { v: 1, sessionId: req.params.id, mode, provenanceKind: first.provenance.kind, replayId: first.provenance.replayId, speed: 1, startedAt: first.provenance.capturedAt ?? new Date(0).toISOString(), state: 'ended' },
      events,
      serverTime: Date.now(),
    };
    return body;
  });

  app.get('/api/sessions/persisted', async () => ({ v: 1, persistence: deps.persistence.kind, sessions: await deps.persistence.listSessions(50) }));

  app.get<{ Params: { id: string } }>('/api/sessions/:id/reference-verdict', async (req, reply) => {
    const v = sessions.referenceVerdict(req.params.id);
    if (!v) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Session not found' } } satisfies ApiError);
    return { v: 1, note: 'Reference verdict at 5s delay and $250 for evidence only. User intent never reaches this service.', verdict: v };
  });

  app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
    const ok = sessions.stop(req.params.id);
    return reply.status(ok ? 200 : 404).send({ stopped: ok });
  });

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>('/api/sessions/:id/events', async (req, reply) => {
    const s = sessions.get(req.params.id);
    if (!s) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Session not found' } } satisfies ApiError);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': req.headers.origin ?? '*',
    });
    reply.raw.write(': second-order stream\n\n');

    const write = (frame: SseFrame, id?: number) => {
      if (reply.raw.destroyed) return;
      reply.raw.write(`${id !== undefined ? `id: ${id}\n` : ''}data: ${JSON.stringify(frame)}\n\n`);
    };

    // Resume support: Last-Event-ID or ?after=<seq>
    const lastId = req.headers['last-event-id'];
    const after = Number(Array.isArray(lastId) ? lastId[0] : lastId ?? req.query.after ?? -1);
    for (const e of s.events) if (e.seq > after) write({ kind: 'event', event: e }, e.seq);

    if (s.info.state === 'ended' || s.info.state === 'failed') {
      write({ kind: 'ended', reason: s.endedReason ?? s.info.state });
      reply.raw.end();
      return reply;
    }

    const unsubscribe = sessions.subscribe(s.info.sessionId, (e) => write({ kind: 'event', event: e }, e.seq));
    const hb = setInterval(() => write({ kind: 'heartbeat', serverTime: Date.now() }), HEARTBEAT_MS);
    const poll = setInterval(() => {
      if (s.info.state === 'ended' || s.info.state === 'failed') {
        write({ kind: 'ended', reason: s.endedReason ?? s.info.state });
        cleanup();
        reply.raw.end();
      }
    }, 500);
    const cleanup = () => { clearInterval(hb); clearInterval(poll); unsubscribe(); };
    req.raw.on('close', cleanup);
    return reply;
  });

  app.addHook('onClose', async () => { await deps.persistence.close(); });
  return app;
}
