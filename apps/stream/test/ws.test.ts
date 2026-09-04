import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { ReconnectingSocket } from '../src/datasources/mobula/ws';

/** A local WebSocket server that can drop clients and go silent, to exercise reconnect and stale handling. */
function server() {
  const wss = new WebSocketServer({ port: 0 });
  const clients: WebSocket[] = [];
  wss.on('connection', (ws) => {
    clients.push(ws);
    ws.on('message', (m) => {
      const msg = JSON.parse(m.toString()) as { type?: string; event?: string };
      if (msg.type === 'subscribe') ws.send(JSON.stringify({ event: 'subscribed', ok: true }));
      if (msg.event === 'pong') ws.send(JSON.stringify({ event: 'pong-seen' }));
    });
  });
  const addr = wss.address() as { port: number };
  return { url: `ws://127.0.0.1:${addr.port}`, clients, wss, close: () => new Promise<void>((r) => wss.close(() => r())) };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('ReconnectingSocket', () => {
  let cleanup: (() => Promise<void>) | null = null;
  afterEach(async () => { await cleanup?.(); cleanup = null; });

  it('subscribes on open, answers pings, reconnects with backoff after a drop', async () => {
    const srv = server();
    const states: string[] = [];
    const frames: unknown[] = [];
    let opens = 0;
    const sock = new ReconnectingSocket({
      url: srv.url,
      onOpen: (send) => { opens++; send({ type: 'subscribe' }); },
      onFrame: (f) => frames.push(f),
      onState: (s) => states.push(s.state + (s.nextRetryMs !== undefined ? `:${s.nextRetryMs > 0}` : '')),
      staleAfterMs: 2000,
    });
    cleanup = async () => { sock.close(); await srv.close(); };
    sock.start();
    await wait(300);
    expect(opens).toBe(1);
    expect(frames).toContainEqual({ event: 'subscribed', ok: true });

    // Server ping → client pong (not surfaced as a frame).
    srv.clients[0]!.send(JSON.stringify({ event: 'ping' }));
    await wait(200);
    expect(frames).toContainEqual({ event: 'pong-seen' });
    expect(frames.some((f) => (f as { event?: string }).event === 'ping')).toBe(false);

    // Drop the client: expect reconnecting with a positive retry delay, then a fresh open + resubscribe.
    srv.clients[0]!.terminate();
    await wait(1200);
    expect(states).toContain('reconnecting:true');
    expect(opens).toBe(2);
    expect(frames.filter((f) => (f as { event?: string }).event === 'subscribed')).toHaveLength(2);
  });

  it('reports stale when the server goes silent and recovers on the next frame', async () => {
    const srv = server();
    const states: string[] = [];
    const sock = new ReconnectingSocket({ url: srv.url, onOpen: () => {}, onFrame: () => {}, onState: (s) => states.push(s.state), staleAfterMs: 600 });
    cleanup = async () => { sock.close(); await srv.close(); };
    sock.start();
    await wait(1900);
    expect(states).toContain('stale');
    srv.clients[srv.clients.length - 1]!.send(JSON.stringify({ event: 'data' }));
    await wait(150);
    expect(states[states.length - 1]).toBe('open');
  });

  it('counts invalid JSON instead of throwing', async () => {
    const srv = server();
    const sock = new ReconnectingSocket({ url: srv.url, onOpen: () => {}, onFrame: () => {}, onState: () => {} });
    cleanup = async () => { sock.close(); await srv.close(); };
    sock.start();
    await wait(200);
    srv.clients[0]!.send('not json');
    await wait(100);
    expect(sock.invalidFrames).toBe(1);
  });
});
