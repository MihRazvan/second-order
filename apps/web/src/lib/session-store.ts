/**
 * Browser-side scenario session. Consumes normalized DomainEvents from the stream
 * service (SSE) or, when the service is unreachable, from the same fixture replayed
 * locally. User intent (size, delay, policy) lives in React state and never enters
 * this store or any request.
 */
import { DomainEvent, SessionInfo, type ReplayManifest, type SseFrame, SseFrame as SseFrameSchema } from '@second-order/contracts';
import { initialScenarioState, reduceScenario, type ScenarioState } from '@second-order/core';
import { DEMO_REPLAY_ID, loadReplay } from '@second-order/replays';

export type Phase = 'armed' | 'connecting' | 'running' | 'ended' | 'failed';
export type Transport = 'stream-sse' | 'browser-replay' | 'none';
export type ConnectionState = 'idle' | 'open' | 'stale' | 'reconnecting' | 'closed';

export interface SessionSnapshot {
  phase: Phase;
  transport: Transport;
  connection: ConnectionState;
  state: ScenarioState;
  manifest: ReplayManifest | null;
  session: SessionInfo | null;
  /** Wall-clock ms when the replay started (for the event-time clock). */
  startedAtWall: number | null;
  speed: number;
  lastFrameAtWall: number | null;
  error: string | null;
  /** Event-time reached so far (max event `at` seen). */
  eventTime: number;
}

const STALE_AFTER_MS = 12_000;
const CONNECT_TIMEOUT_MS = 3_000;

export class SessionStore {
  private snap: SessionSnapshot;
  private listeners = new Set<() => void>();
  private es: EventSource | null = null;
  private localAbort: AbortController | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private streamUrl: string, private replayId: string = DEMO_REPLAY_ID) {
    this.snap = {
      phase: 'armed', transport: 'none', connection: 'idle', state: initialScenarioState(), manifest: null, session: null,
      startedAtWall: null, speed: 1, lastFrameAtWall: null, error: null, eventTime: 0,
    };
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snap;
  private set(patch: Partial<SessionSnapshot>) { this.snap = { ...this.snap, ...patch }; for (const l of this.listeners) l(); }

  private apply(event: DomainEvent) {
    const state = reduceScenario(this.snap.state, event);
    if (state === this.snap.state) return;
    this.set({ state, eventTime: Math.max(this.snap.eventTime, event.at), lastFrameAtWall: Date.now() });
  }

  /** Load the tracked-wallet context (fixture origin) before the crash test starts. */
  async arm(): Promise<void> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), CONNECT_TIMEOUT_MS);
      const res = await fetch(`${this.streamUrl}/api/replays/${this.replayId}/context`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`context ${res.status}`);
      const body = (await res.json()) as { manifest: ReplayManifest; events: unknown[] };
      let state = this.snap.state;
      for (const raw of body.events) state = reduceScenario(state, DomainEvent.parse(raw));
      this.set({ state, manifest: body.manifest, transport: 'stream-sse', speed: body.manifest.defaultSpeed });
    } catch {
      const file = loadReplay(this.replayId);
      if (!file) { this.set({ phase: 'failed', error: 'Replay fixture unavailable' }); return; }
      let state = this.snap.state;
      for (const e of file.events) if (e.at === 0 && e.type !== 'stream.status') state = reduceScenario(state, e);
      this.set({ state, manifest: file.manifest, transport: 'browser-replay', speed: file.manifest.defaultSpeed });
    }
  }

  /** Start the crash test: a stream session over SSE, or a local replay if the service is down. */
  async start(): Promise<void> {
    if (this.snap.phase === 'running' || this.snap.phase === 'connecting') return;
    this.set({ phase: 'connecting', error: null });
    if (this.snap.transport !== 'browser-replay') {
      try {
        await this.startStream();
        return;
      } catch (err) {
        console.warn('[second-order] stream unavailable, falling back to browser replay', err);
      }
    }
    this.startLocal();
  }

  private async startStream() {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CONNECT_TIMEOUT_MS);
    const res = await fetch(`${this.streamUrl}/api/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ mode: 'replay', replayId: this.replayId, speed: this.snap.speed }),
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`sessions ${res.status}`);
    const session = SessionInfo.parse(await res.json());
    const es = new EventSource(`${this.streamUrl}/api/sessions/${session.sessionId}/events`);
    this.es = es;
    this.set({ session, transport: 'stream-sse', connection: 'open', phase: 'running', startedAtWall: Date.now(), lastFrameAtWall: Date.now() });
    es.onmessage = (m) => {
      const parsed = SseFrameSchema.safeParse(JSON.parse(m.data));
      if (!parsed.success) { console.warn('[second-order] dropped invalid frame'); return; }
      this.onFrame(parsed.data);
    };
    es.onerror = () => {
      if (this.snap.phase === 'ended') return;
      this.set({ connection: es.readyState === EventSource.CLOSED ? 'closed' : 'reconnecting' });
    };
    es.onopen = () => this.set({ connection: 'open' });
    this.staleTimer = setInterval(() => {
      if (this.snap.phase !== 'running') return;
      const age = Date.now() - (this.snap.lastFrameAtWall ?? 0);
      if (age > STALE_AFTER_MS && this.snap.connection === 'open') this.set({ connection: 'stale' });
    }, 1000);
  }

  private onFrame(frame: SseFrame) {
    switch (frame.kind) {
      case 'event': this.apply(frame.event); if (this.snap.connection !== 'open') this.set({ connection: 'open' }); break;
      case 'heartbeat': this.set({ lastFrameAtWall: Date.now(), connection: 'open' }); break;
      case 'ended': this.finish(); break;
    }
  }

  private startLocal() {
    const file = loadReplay(this.replayId);
    if (!file) { this.set({ phase: 'failed', error: 'Replay fixture unavailable' }); return; }
    const abort = new AbortController();
    this.localAbort = abort;
    const speed = this.snap.speed || file.manifest.defaultSpeed;
    const origin = Date.now();
    this.set({ transport: 'browser-replay', connection: 'open', phase: 'running', startedAtWall: origin, lastFrameAtWall: origin, speed });
    const events = file.events.filter((e) => !(e.at === 0 && e.type !== 'stream.status'));
    let i = 0;
    const tick = () => {
      if (abort.signal.aborted) return;
      const now = Date.now();
      while (i < events.length && origin + events[i]!.at / speed <= now) {
        this.apply({ ...events[i]!, provenance: { ...events[i]!.provenance, source: 'browser-replay' } });
        i++;
      }
      if (i >= events.length) { this.finish(); return; }
      setTimeout(tick, 40);
    };
    tick();
  }

  private finish() {
    this.teardown();
    this.set({ phase: 'ended', connection: 'closed' });
  }

  private teardown() {
    this.es?.close(); this.es = null;
    this.localAbort?.abort(); this.localAbort = null;
    if (this.staleTimer) { clearInterval(this.staleTimer); this.staleTimer = null; }
  }

  /** Back to the armed state with the same wallet context. */
  async reset() {
    this.teardown();
    this.snap = { ...this.snap, phase: 'armed', connection: 'idle', state: initialScenarioState(), session: null, startedAtWall: null, lastFrameAtWall: null, error: null, eventTime: 0 };
    for (const l of this.listeners) l();
    await this.arm();
  }

  destroy() { this.teardown(); }
}
