import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReplayFile, type DomainEvent, type ReplayManifest } from '@second-order/contracts';
import { loadReplay as loadBundled, listReplays as listBundled, DEMO_REPLAY_ID } from '@second-order/replays';
import type { CapabilityReport, DataSource, SessionSpec } from './types.js';

/** Bundled fixtures plus any captured sessions in `captureDir` (validated on read, never trusted blindly). */
export class ReplayLibrary {
  constructor(private captureDir?: string) {}
  private captured(): Map<string, ReplayFile> {
    const out = new Map<string, ReplayFile>();
    if (!this.captureDir) return out;
    let names: string[] = [];
    try { names = readdirSync(this.captureDir).filter((n) => n.endsWith('.json')); } catch { return out; }
    for (const n of names) {
      try {
        const parsed = ReplayFile.safeParse(JSON.parse(readFileSync(join(this.captureDir, n), 'utf8')));
        if (parsed.success) out.set(parsed.data.manifest.id, parsed.data);
      } catch { /* skip unreadable file */ }
    }
    return out;
  }
  list(): ReplayManifest[] {
    const captured = [...this.captured().values()].map((f) => f.manifest).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return [...listBundled(), ...captured];
  }
  load(id: string): ReplayFile | null {
    return loadBundled(id) ?? this.captured().get(id) ?? null;
  }
}

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
  constructor(readonly library: ReplayLibrary = new ReplayLibrary()) {}

  provenanceKind(spec: SessionSpec) {
    return this.library.load(spec.replayId ?? DEMO_REPLAY_ID)?.manifest.provenance.kind ?? 'demo-scenario';
  }

  async capabilities(): Promise<CapabilityReport> {
    const caps: CapabilityReport['capabilities'] = {};
    for (const m of this.library.list()) caps[`replay:${m.id}`] = 'available';
    return { provider: 'replay', capabilities: caps, checkedAt: new Date().toISOString() };
  }

  async *start(spec: SessionSpec, signal: AbortSignal): AsyncIterable<DomainEvent> {
    const file = this.library.load(spec.replayId ?? DEMO_REPLAY_ID);
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
