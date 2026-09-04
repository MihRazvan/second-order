import { z } from 'zod';
import { DomainEvent } from './events';
import { Provenance, ProvenanceKind } from './provenance';

export const API_VERSION = 1 as const;

export const ReplayManifest = z.object({
  v: z.literal(1),
  id: z.string().min(1),
  title: z.string(),
  description: z.string(),
  provenance: Provenance,
  /** Total fixture duration in event-time ms. */
  durationMs: z.number().nonnegative(),
  /** Recommended playback speed for the demo. */
  defaultSpeed: z.number().positive(),
  eventCount: z.number().int().nonnegative(),
  generator: z.object({ name: z.string(), version: z.string(), seed: z.number().int() }).optional(),
  /** Human-readable disclosure shown in the UI. Must never claim live capture for demo fixtures. */
  disclosure: z.string(),
  createdAt: z.string().datetime(),
});
export type ReplayManifest = z.infer<typeof ReplayManifest>;

export const ReplayFile = z.object({
  manifest: ReplayManifest,
  events: z.array(DomainEvent),
});
export type ReplayFile = z.infer<typeof ReplayFile>;

export const SessionMode = z.enum(['replay', 'live']);
export type SessionMode = z.infer<typeof SessionMode>;

export const CreateSessionRequest = z.object({
  mode: SessionMode.default('replay'),
  replayId: z.string().optional(),
  speed: z.number().positive().max(64).optional(),
  /** Live mode only: wallet to track. */
  wallet: z.string().optional(),
  chainId: z.string().optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const SessionInfo = z.object({
  v: z.literal(API_VERSION),
  sessionId: z.string(),
  mode: SessionMode,
  provenanceKind: ProvenanceKind,
  replayId: z.string().optional(),
  speed: z.number().positive(),
  startedAt: z.string().datetime(),
  state: z.enum(['pending', 'running', 'ended', 'failed']),
});
export type SessionInfo = z.infer<typeof SessionInfo>;

export const SessionSnapshot = z.object({
  v: z.literal(API_VERSION),
  session: SessionInfo,
  events: z.array(DomainEvent),
  serverTime: z.number(),
});
export type SessionSnapshot = z.infer<typeof SessionSnapshot>;

/** SSE frame `data:` body. `id:` carries the event seq for Last-Event-ID resume. */
export const SseFrame = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('event'), event: DomainEvent }),
  z.object({ kind: z.literal('heartbeat'), serverTime: z.number() }),
  z.object({ kind: z.literal('ended'), reason: z.string() }),
]);
export type SseFrame = z.infer<typeof SseFrame>;

export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  service: z.string(),
  version: z.string(),
  uptimeMs: z.number(),
  persistence: z.enum(['postgres', 'memory']),
  providers: z.record(z.string(), z.enum(['ready', 'disabled', 'error'])),
  sessions: z.number().int().nonnegative(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const ApiError = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiError>;
