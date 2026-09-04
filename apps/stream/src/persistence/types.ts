import type { DomainEvent, ReplayManifest } from '@second-order/contracts';

export interface CapacityRow {
  id: string;
  sessionId: string;
  at: number;
  delayMs: number;
  competingFlowUsd: number;
  capacityUsd: number;
  confidence: string;
  degraded: boolean;
}

export interface ProcessingError {
  id: string;
  sessionId?: string;
  stage: 'validate' | 'normalize' | 'persist' | 'ws' | 'rest';
  code: string;
  message: string;
  rawSample?: unknown;
}

export interface Persistence {
  readonly kind: 'postgres' | 'memory';
  /** Idempotent: returns false when the event id already existed. */
  saveEvent(event: DomainEvent): Promise<boolean>;
  saveCapacity(row: CapacityRow): Promise<void>;
  saveManifest(manifest: ReplayManifest): Promise<void>;
  saveError(err: ProcessingError): Promise<void>;
  /** Every persisted event of a session in seq order (source, quotes, flow, security, market). */
  listEvents(sessionId: string): Promise<DomainEvent[]>;
  /** Session ids known to the store, newest first. */
  listSessions(limit?: number): Promise<{ sessionId: string; events: number; firstAt: string }[]>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}
