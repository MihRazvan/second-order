import type { ShadowOutcome } from '@second-order/core';
import { evColor } from './scales';

interface Marks {
  shadows: ShadowOutcome[];
  x: (delayMs: number) => number;
  y: (sizeUsd: number) => number;
  r?: number;
  /** Followers with delay above this are drawn as not-yet-entered outlines. */
  revealUpToMs?: number;
  shape?: 'dot' | 'tick' | 'square';
}

/** Shadow-follower marks. Colour = scenario-adjusted outcome; never a claim about real wallets. */
export function SwarmMarks({ shadows, x, y, r = 4, revealUpToMs = Infinity, shape = 'dot' }: Marks) {
  return (
    <g>
      {shadows.map((f) => {
        const entered = f.delayMs <= revealUpToMs;
        const c = evColor(f.evPct);
        const cx = x(f.delayMs);
        const cy = y(f.sizeUsd);
        if (shape === 'tick') {
          return <line key={f.id} x1={cx} x2={cx} y1={cy - r * 1.6} y2={cy + r * 1.6} stroke={entered ? c : 'var(--so-line-strong)'} strokeWidth={entered ? 2 : 1} opacity={entered ? 0.95 : 0.5} />;
        }
        if (shape === 'square') {
          return <rect key={f.id} x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={entered ? c : 'none'} stroke={entered ? 'none' : 'var(--so-line-strong)'} opacity={entered ? 0.9 : 0.6} />;
        }
        return <circle key={f.id} cx={cx} cy={cy} r={r} fill={entered ? c : 'none'} stroke={entered ? 'none' : 'var(--so-line-strong)'} strokeWidth={1} opacity={entered ? 0.92 : 0.6} />;
      })}
    </g>
  );
}

export function LogGrid({ x, y, delays, sizes, x0, x1, y0, y1 }: { x: (v: number) => number; y: (v: number) => number; delays: number[]; sizes: number[]; x0: number; x1: number; y0: number; y1: number }) {
  return (
    <g stroke="var(--so-line)" strokeWidth={1} shapeRendering="crispEdges">
      {delays.map((d) => <line key={`d${d}`} x1={x(d)} x2={x(d)} y1={y0} y2={y1} />)}
      {sizes.map((s) => <line key={`s${s}`} x1={x0} x2={x1} y1={y(s)} y2={y(s)} />)}
    </g>
  );
}
