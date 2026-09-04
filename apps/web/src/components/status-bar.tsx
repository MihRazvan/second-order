'use client';
import { PROVENANCE_LABEL, type ProvenanceKind } from '@second-order/contracts';
import type { ConnectionState, Phase, Transport } from '@/lib/session-store';

interface Props {
  provenance: ProvenanceKind | null;
  transport: Transport;
  connection: ConnectionState;
  phase: Phase;
  speed: number;
  nowAt: number;
  degraded: boolean;
}

function Square({ tone }: { tone: 'alpha' | 'amber' | 'red' | 'evidence' | 'faint' }) {
  const bg = { alpha: 'bg-alpha', amber: 'bg-amber', red: 'bg-red', evidence: 'bg-evidence', faint: 'bg-fg-faint' }[tone];
  return <span aria-hidden className={`inline-block h-[7px] w-[7px] ${bg}`} />;
}

/** Provenance, transport and freshness. Small, always visible, never decorative. */
export function StatusBar({ provenance, transport, connection, phase, speed, nowAt, degraded }: Props) {
  const provTone = provenance === 'live-witnessed' ? 'alpha' : provenance === 'estimated-reconstruction' ? 'evidence' : 'amber';
  const conn = (() => {
    if (transport === 'browser-replay') return { tone: 'evidence' as const, label: `Local replay ${speed}×` };
    if (transport === 'none') return { tone: 'faint' as const, label: 'Connecting' };
    if (connection === 'stale') return { tone: 'amber' as const, label: 'Stream stale' };
    if (connection === 'reconnecting') return { tone: 'amber' as const, label: 'Reconnecting' };
    if (connection === 'closed' && phase !== 'ended') return { tone: 'red' as const, label: 'Stream closed' };
    return { tone: 'alpha' as const, label: `Stream replay ${speed}×` };
  })();
  return (
    <div className="font-data flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-fg-muted">
      <span className="flex items-center gap-2" title={provenance === 'demo-scenario' ? 'Synthetic fixture. Nothing here was captured from a live market.' : undefined}>
        <Square tone={provTone} />
        {provenance ? PROVENANCE_LABEL[provenance] : 'No data'}
      </span>
      <span className="flex items-center gap-2"><Square tone={conn.tone} />{conn.label}</span>
      {degraded && <span className="flex items-center gap-2 text-amber"><Square tone="amber" />Data incomplete · no ALLOW</span>}
      <span className="text-fg tabular-nums">T+{(nowAt / 1000).toFixed(1)} s</span>
    </div>
  );
}
