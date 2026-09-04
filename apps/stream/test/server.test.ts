import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DomainEvent, HealthResponse, SessionInfo, SessionSnapshot, SseFrame } from '@second-order/contracts';
import { loadConfig } from '../src/config';
import { ReplayDataSource } from '../src/datasources/replay';
import { MemoryPersistence } from '../src/persistence/memory';
import { buildServer } from '../src/server';

let app: FastifyInstance;
let base: string;
const persistence = new MemoryPersistence();

beforeAll(async () => {
  app = await buildServer({
    config: loadConfig({ PORT: '0', CORS_ORIGIN: 'http://localhost:3000' }),
    persistence,
    sources: { replay: new ReplayDataSource(), mobula: null },
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  base = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr!.port}`;
});
afterAll(async () => { await app.close(); });

describe('stream service', () => {
  it('reports health without secrets', async () => {
    const res = await fetch(`${base}/health`);
    const body = HealthResponse.parse(await res.json());
    expect(body.status).toBe('ok');
    expect(body.persistence).toBe('memory');
    expect(body.providers.mobula).toBe('disabled');
    expect(JSON.stringify(body)).not.toMatch(/MOBULA_API_KEY|postgres:\/\//);
  });

  it('lists replays with demo-scenario provenance', async () => {
    const res = await fetch(`${base}/api/replays`);
    const body = (await res.json()) as { replays: { id: string; provenance: { kind: string } }[] };
    expect(body.replays.length).toBeGreaterThan(0);
    expect(body.replays.every((r) => r.provenance.kind === 'demo-scenario')).toBe(true);
  });

  it('rejects a malformed session request with a typed error', async () => {
    const res = await fetch(`${base}/api/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ speed: -1 }) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('refuses live sessions when Mobula is not configured', async () => {
    const res = await fetch(`${base}/api/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'live', wallet: '0xabc' }) });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('PROVIDER_UNAVAILABLE');
    expect(body.error.message).not.toMatch(/at .*\.ts/); // no stack trace
  });

  it('streams a replay over SSE with valid frames, ordering and resume', async () => {
    const created = await fetch(`${base}/api/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'replay', speed: 64 }) });
    expect(created.status).toBe(201);
    const info = SessionInfo.parse(await created.json());
    expect(info.provenanceKind).toBe('demo-scenario');

    const res = await fetch(`${base}/api/sessions/${info.sessionId}/events`);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const frames: SseFrame[] = [];
    let ended = false;
    while (!ended) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const data = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (!data) continue;
        const frame = SseFrame.parse(JSON.parse(data.slice(6)));
        frames.push(frame);
        if (frame.kind === 'ended') ended = true;
      }
    }
    const events = frames.filter((f): f is Extract<SseFrame, { kind: 'event' }> => f.kind === 'event').map((f) => DomainEvent.parse(f.event));
    expect(events.length).toBeGreaterThan(100);
    for (let i = 1; i < events.length; i++) expect(events[i]!.seq).toBeGreaterThan(events[i - 1]!.seq);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    expect(events.every((e) => e.sessionId === info.sessionId)).toBe(true);

    // Snapshot has the same events; resume from the middle returns only the tail.
    const snap = SessionSnapshot.parse(await (await fetch(`${base}/api/sessions/${info.sessionId}/snapshot`)).json());
    expect(snap.events.length).toBe(events.length);
    const mid = events[Math.floor(events.length / 2)]!.seq;
    const tail = await fetch(`${base}/api/sessions/${info.sessionId}/events`, { headers: { 'last-event-id': String(mid) } });
    const text = await tail.text();
    const tailCount = text.split('\n\n').filter((c) => c.includes('"kind":"event"')).length;
    expect(tailCount).toBe(events.filter((e) => e.seq > mid).length);

    // Persistence saw every event once.
    expect((await persistence.listEvents(info.sessionId)).length).toBe(events.length);
    expect(persistence.capacity.length).toBeGreaterThan(0);
  }, 30_000);
});
