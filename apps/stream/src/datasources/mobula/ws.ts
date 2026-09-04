/**
 * Reconnecting WebSocket for Mobula streams.
 * - exponential backoff with jitter: min(30s, 500ms · 2^n) + U(0, 250ms)
 * - heartbeat: replies to {event:"ping"}; a stale timer fires when no frame arrives
 * - every frame is handed to the caller as parsed JSON; invalid JSON is counted, not thrown
 */
import WebSocket from 'ws';

export type SocketState = 'connecting' | 'open' | 'reconnecting' | 'stale' | 'closed';

export interface ReconnectingSocketOptions {
  url: string;
  /** Called on every (re)open; must send subscriptions. */
  onOpen: (send: (payload: unknown) => void) => void;
  onFrame: (frame: unknown) => void;
  onState: (s: { state: SocketState; attempt: number; nextRetryMs?: number; lastMessageAgeMs?: number; message?: string }) => void;
  staleAfterMs?: number;
  maxBackoffMs?: number;
  headers?: Record<string, string>;
}

export class ReconnectingSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private closed = false;
  private lastMessageAt = 0;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stale = false;
  invalidFrames = 0;

  constructor(private opts: ReconnectingSocketOptions) {}

  start() {
    this.closed = false;
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    this.opts.onState({ state: this.attempt === 0 ? 'connecting' : 'reconnecting', attempt: this.attempt });
    const ws = new WebSocket(this.opts.url, { headers: this.opts.headers });
    this.ws = ws;
    ws.on('open', () => {
      this.lastMessageAt = Date.now();
      this.stale = false;
      this.opts.onState({ state: 'open', attempt: this.attempt });
      this.attempt = 0;
      this.opts.onOpen((payload) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload)); });
      this.armStaleTimer();
    });
    ws.on('message', (data) => {
      this.lastMessageAt = Date.now();
      if (this.stale) { this.stale = false; this.opts.onState({ state: 'open', attempt: 0 }); }
      let frame: unknown;
      try { frame = JSON.parse(data.toString()); } catch { this.invalidFrames++; return; }
      if (frame && typeof frame === 'object' && (frame as { event?: string }).event === 'ping') {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: 'pong' }));
        return;
      }
      this.opts.onFrame(frame);
    });
    const onDown = (reason: string) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearStaleTimer();
      if (this.closed) { this.opts.onState({ state: 'closed', attempt: this.attempt, message: reason }); return; }
      const backoff = Math.min(this.opts.maxBackoffMs ?? 30_000, 500 * 2 ** this.attempt) + Math.random() * 250;
      this.attempt++;
      this.opts.onState({ state: 'reconnecting', attempt: this.attempt, nextRetryMs: Math.round(backoff), message: reason });
      this.retryTimer = setTimeout(() => this.connect(), backoff);
    };
    ws.on('close', (code) => onDown(`closed ${code}`));
    ws.on('error', (err) => onDown(err.message));
  }

  private armStaleTimer() {
    this.clearStaleTimer();
    const staleAfter = this.opts.staleAfterMs ?? 15_000;
    this.staleTimer = setInterval(() => {
      const age = Date.now() - this.lastMessageAt;
      if (age > staleAfter && !this.stale) {
        this.stale = true;
        this.opts.onState({ state: 'stale', attempt: 0, lastMessageAgeMs: age });
      }
      // Two stale periods with nothing at all: force a reconnect.
      if (age > staleAfter * 2 && this.ws) this.ws.terminate();
    }, 1000);
  }

  private clearStaleTimer() { if (this.staleTimer) { clearInterval(this.staleTimer); this.staleTimer = null; } }

  send(payload: unknown) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload)); }

  close() {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.clearStaleTimer();
    this.ws?.close();
    this.ws = null;
  }
}
