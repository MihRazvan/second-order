import type { CapabilityState, DomainEvent, ProvenanceKind, SessionMode } from '@second-order/contracts';

export interface SessionSpec {
  sessionId: string;
  mode: SessionMode;
  replayId?: string;
  speed?: number;
  wallet?: string;
  chainId?: string;
  tradeIndex?: number;
  windowSeconds?: number;
}

export interface CapabilityReport {
  provider: 'replay' | 'mobula';
  capabilities: Record<string, CapabilityState>;
  checkedAt: string;
}

export interface DataSource {
  readonly kind: 'replay' | 'mobula';
  provenanceKind(spec: SessionSpec): ProvenanceKind;
  capabilities(): Promise<CapabilityReport>;
  /** Emits normalized events until the session ends or `signal` aborts. */
  start(spec: SessionSpec, signal: AbortSignal): AsyncIterable<DomainEvent>;
}
