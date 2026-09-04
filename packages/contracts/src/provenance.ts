import { z } from 'zod';

/**
 * Provenance is the only way the UI may learn where an event came from.
 * `demo-scenario`: synthetic fixture, never derived from a captured market.
 * `estimated-reconstruction`: rebuilt from historical Mobula REST data after the fact.
 * `live-witnessed`: captured from a Mobula stream/REST call by this process while it happened.
 */
export const ProvenanceKind = z.enum(['demo-scenario', 'estimated-reconstruction', 'live-witnessed']);
export type ProvenanceKind = z.infer<typeof ProvenanceKind>;

export const ProvenanceSource = z.enum(['replay', 'mobula-rest', 'mobula-wss', 'browser-replay']);
export type ProvenanceSource = z.infer<typeof ProvenanceSource>;

export const Provenance = z.object({
  kind: ProvenanceKind,
  source: ProvenanceSource,
  /** ISO timestamp of the original capture (live / reconstruction only). */
  capturedAt: z.string().datetime().optional(),
  /** Mobula endpoint or stream name the observation came from. */
  endpoint: z.string().optional(),
  /** Replay id when the event is being replayed. */
  replayId: z.string().optional(),
});
export type Provenance = z.infer<typeof Provenance>;

export const PROVENANCE_LABEL: Record<ProvenanceKind, string> = {
  'demo-scenario': 'Demo scenario',
  'estimated-reconstruction': 'Estimated reconstruction',
  'live-witnessed': 'Live witnessed',
};
