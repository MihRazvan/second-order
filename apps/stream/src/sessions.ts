import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReplayFile } from '@second-order/contracts';
import type { DomainEvent, SessionInfo, SessionMode } from '@second-order/contracts';
import { crowdGuard, deriveInputs, initialScenarioState, reduceScenario, remainingAlpha, DEFAULT_POLICY, type ScenarioState } from '@second-order/core';
import type { FastifyBaseLogger } from 'fastify';
import type { DataSource, SessionSpec } from './datasources/types.js';
import type { Persistence } from './persistence/types.js';

export type Listener = (event: DomainEvent) => void;

export interface Session {
  info: SessionInfo;
  events: DomainEvent[];
  state: ScenarioState;
  listeners: Set<Listener>;
  abort: AbortController;
  endedReason?: string;
}

const REFERENCE_DELAY_MS = 5000; // server-side derived snapshot uses a fixed reference delay; user delay never reaches the server

export class SessionManager {
  private sessions = new Map<string, Session>();
  constructor(
    private sources: Record<'replay' | 'mobula' | 'reconstruction', DataSource | null>,
    private persistence: Persistence,
    private log: FastifyBaseLogger,
    private maxSessions = 50,
    private captureDir?: string,
  ) {}

  list(): SessionInfo[] { return [...this.sessions.values()].map((s) => s.info); }
  get(id: string): Session | undefined { return this.sessions.get(id); }
  count() { return this.sessions.size; }

  async create(input: { mode: SessionMode; replayId?: string; speed?: number; wallet?: string; chainId?: string; tradeIndex?: number; windowSeconds?: number }): Promise<Session> {
    const source = input.mode === 'live' ? this.sources.mobula : input.mode === 'reconstruction' ? this.sources.reconstruction : this.sources.replay;
    if (!source) throw Object.assign(new Error(`${input.mode} provider is not configured`), { code: 'PROVIDER_UNAVAILABLE', status: 503 });
    if (this.sessions.size >= this.maxSessions) this.evictOldest();

    const sessionId = randomUUID();
    const spec: SessionSpec = { sessionId, mode: input.mode, replayId: input.replayId, speed: input.speed, wallet: input.wallet, chainId: input.chainId, tradeIndex: input.tradeIndex, windowSeconds: input.windowSeconds };
    const session: Session = {
      info: {
        v: 1,
        sessionId,
        mode: input.mode,
        provenanceKind: source.provenanceKind(spec),
        replayId: input.replayId,
        speed: input.speed ?? 1,
        startedAt: new Date().toISOString(),
        state: 'pending',
      },
      events: [],
      state: initialScenarioState(),
      listeners: new Set(),
      abort: new AbortController(),
    };
    this.sessions.set(sessionId, session);
    void this.run(session, source, spec);
    return session;
  }

  private async run(session: Session, source: DataSource, spec: SessionSpec) {
    session.info.state = 'running';
    try {
      for await (const raw of source.start(spec, session.abort.signal)) {
        const event = raw;
        if (session.state.seen.has(event.id)) { this.log.debug({ id: event.id }, 'duplicate event dropped'); continue; }
        session.state = reduceScenario(session.state, event);
        session.events.push(event);
        if (event.type === 'stream.status' && !session.info.speed && event.payload.speed) session.info.speed = event.payload.speed;
        this.persistence.saveEvent(event).catch((err) => this.log.warn({ err }, 'persist failed'));
        for (const l of session.listeners) { try { l(event); } catch (err) { this.log.warn({ err }, 'listener failed'); } }
        if (event.type === 'quote.observed' || event.type === 'flow.competing' || event.type === 'source.exit') this.snapshotCapacity(session, event.at);
      }
      session.info.state = 'ended';
      session.endedReason = session.abort.signal.aborted ? 'aborted' : 'complete';
      if (session.info.mode !== 'replay') this.capture(session);
    } catch (err) {
      session.info.state = 'failed';
      session.endedReason = 'failed';
      this.log.error({ err, sessionId: session.info.sessionId }, 'session failed');
      await this.persistence.saveError({ id: randomUUID(), sessionId: session.info.sessionId, stage: 'ws', code: 'SESSION_FAILED', message: err instanceof Error ? err.message : String(err) }).catch(() => {});
    }
  }

  /** Server-side derived snapshot for persistence/evidence. Uses a fixed reference delay; never user data. */
  private lastSnapshotAt = new Map<string, number>();
  private snapshotCapacity(session: Session, at: number) {
    const last = this.lastSnapshotAt.get(session.info.sessionId) ?? -Infinity;
    if (at - last < 1000) return;
    this.lastSnapshotAt.set(session.info.sessionId, at);
    const derived = deriveInputs(session.state, { nowAt: at });
    if (!derived) return;
    const cap = remainingAlpha(derived, REFERENCE_DELAY_MS, DEFAULT_POLICY);
    this.persistence.saveCapacity({
      id: `${session.info.sessionId}:${at}`,
      sessionId: session.info.sessionId,
      at,
      delayMs: REFERENCE_DELAY_MS,
      competingFlowUsd: derived.competingFlowUsd,
      capacityUsd: cap.capacityUsd,
      confidence: cap.confidence,
      degraded: derived.quality.degraded,
    }).catch((err) => this.log.warn({ err }, 'capacity persist failed'));
  }

  /** Persist a live session as a replay fixture. Provenance stays live-witnessed; the manifest says when and how it was captured. */
  private capture(session: Session) {
    if (!this.captureDir || session.events.length === 0) return;
    try {
      mkdirSync(this.captureDir, { recursive: true });
      const trade = session.state.sourceTrade;
      const kind = session.info.provenanceKind;
      const prefix = kind === 'live-witnessed' ? 'live' : 'recon';
      const id = `${prefix}-${trade?.token.symbol?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? 'session'}-${session.info.startedAt.slice(0, 19).replace(/[:T-]/g, '')}`;
      const file: ReplayFile = {
        manifest: {
          v: 1,
          id,
          title: trade ? `${kind === 'live-witnessed' ? 'Live witnessed' : 'Estimated reconstruction'}: ${trade.side.toUpperCase()} ${trade.token.symbol} by ${trade.wallet.slice(0, 8)}…` : 'Captured session',
          description: `${kind === 'live-witnessed' ? 'Captured from Mobula streams while it happened' : 'Reconstructed from Mobula REST history'} by the stream service. ${session.events.length} events over ${Math.round(session.state.lastEventAt / 1000)} s of event time.`,
          provenance: { kind, source: kind === 'live-witnessed' ? 'mobula-wss' : 'mobula-rest', capturedAt: session.info.startedAt },
          durationMs: session.state.lastEventAt,
          // Replay any captured window in about fifteen seconds.
          defaultSpeed: Math.max(1, Math.round(session.state.lastEventAt / 15_000)),
          eventCount: session.events.length,
          disclosure: kind === 'live-witnessed'
            ? `Live witnessed. Observations were captured from Mobula endpoints while they happened (session ${session.info.sessionId}, started ${session.info.startedAt}). Replaying them does not re-observe the market.`
            : `Estimated reconstruction. Trades, prices and context were fetched from Mobula REST history after the fact (session ${session.info.sessionId}, started ${session.info.startedAt}). Quotes are inferred from the price path and current pool depth, not observed.`,
          createdAt: new Date().toISOString(),
        },
        events: session.events,
      };
      writeFileSync(join(this.captureDir, `${id}.json`), JSON.stringify(file, null, 1));
      void this.persistence.saveManifest(file.manifest);
      this.log.info({ id, events: session.events.length }, 'live session captured');
    } catch (err) {
      this.log.warn({ err }, 'capture failed');
    }
  }

  subscribe(id: string, listener: Listener): () => void {
    const s = this.sessions.get(id);
    if (!s) throw Object.assign(new Error('Session not found'), { code: 'NOT_FOUND', status: 404 });
    s.listeners.add(listener);
    return () => s.listeners.delete(listener);
  }

  stop(id: string) {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.abort.abort();
    return true;
  }

  private evictOldest() {
    const oldest = [...this.sessions.values()].sort((a, b) => a.info.startedAt.localeCompare(b.info.startedAt))[0];
    if (oldest) { oldest.abort.abort(); this.sessions.delete(oldest.info.sessionId); }
  }

  /** Verdict for evidence/debug at the reference delay and a reference size. Never receives user intent. */
  referenceVerdict(id: string) {
    const s = this.sessions.get(id);
    if (!s) return null;
    return crowdGuard(s.state, { sizeUsd: 250, delayMs: REFERENCE_DELAY_MS }, DEFAULT_POLICY, s.state.lastEventAt);
  }
}
