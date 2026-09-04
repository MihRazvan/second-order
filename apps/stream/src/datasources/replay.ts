import type { DomainEvent } from '@second-order/contracts';
import { loadReplay, listReplays, DEMO_REPLAY_ID } from '@second-order/replays';
import type { CapabilityReport, DataSource, SessionSpec } from './types.js';

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted || ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });

/**
 * Replays a fixture with its original relative timing divided by `speed`.
 * Event ids and payloads are untouched; only `sessionId` is re-stamped.
 */
export class ReplayDataSource implements DataSource {
  readonly kind = 'replay' as const;

  provenanceKind(spec: SessionSpec) {
    return loadReplay(spec.replayId ?? DEMO_REPLAY_ID)?.manifest.provenance.kind ?? 'demo-scenario';
  }

  async capabilities(): Promise<CapabilityReport> {
    const caps: CapabilityReport['capabilities'] = {};
    for (const m of listReplays()) caps[`replay:${m.id}`] = 'available';
    return { provider: 'replay', capabilities: caps, checkedAt: new Date().toISOString() };
  }

  async *start(spec: SessionSpec, signal: AbortSignal): AsyncIterable<DomainEvent> {
    const file = loadReplay(spec.replayId ?? DEMO_REPLAY_ID);
    if (!file) throw new Error(`Unknown replay ${spec.replayId}`);
    const speed = spec.speed ?? file.manifest.defaultSpeed;
    const origin = Date.now();
    for (const e of file.events) {
      if (signal.aborted) return;
      const due = origin + e.at / speed;
      await sleep(due - Date.now(), signal);
      if (signal.aborted) return;
      yield { ...e, sessionId: spec.sessionId, provenance: { ...e.provenance, replayId: file.manifest.id } };
    }
  }
}
