'use client';
import type { DerivedInputs, ScenarioState, ShadowOutcome } from '@second-order/core';
import { fmtUsdWhole } from '@/lib/format';
import type { TimelinePoint } from '@/lib/demo-snapshot';
import { evColor, linear, sizeScale } from '@/viz/scales';
import { timeScale, TIME_TICKS_MS, tickLabel } from '@/viz/time';

export interface RecorderProps {
  state: ScenarioState;
  derived: DerivedInputs | null;
  shadows: ShadowOutcome[];
  timeline: TimelinePoint[];
  nowAt: number;
  durationMs: number;
  startAlphaUsd: number;
  /** Live Remaining Alpha at the user's delay (the per-second timeline lags it slightly). */
  remainingUsd: number | null;
  intent: { sizeUsd: number; delayMs: number };
  phase: 'armed' | 'connecting' | 'running' | 'ended' | 'failed';
  reducedMotion: boolean;
  width?: number;
}

const GUTTER = 196;
const MARKERS = { y: 0, h: 44 };
const LANES = { alpha: { y: 52, h: 146 }, swarm: { y: 212, h: 164 }, depth: { y: 390, h: 90 } };
const H = 512;

/**
 * The flight recorder. One square-root time axis; three lanes; one playhead.
 * Everything drawn here comes from reduced events; nothing is scripted.
 */
export function Recorder({ state, derived, shadows, timeline, nowAt, durationMs, startAlphaUsd, remainingUsd, intent, phase, reducedMotion, width = 1376 }: RecorderProps) {
  const W = width;
  const t = timeScale(durationMs, [GUTTER, W - 20]);
  const px = t(nowAt);

  // Lane 1 · Remaining Alpha
  const A = LANES.alpha;
  const aMax = Math.max(startAlphaUsd, ...timeline.map((p) => p.remainingUsd), 1);
  const ay = linear([0, aMax], [A.y + A.h - 4, A.y + 10]);
  const pts = timeline.filter((p) => p.at <= nowAt);
  const lastAlpha = remainingUsd ?? (pts.length ? pts[pts.length - 1]!.remainingUsd : startAlphaUsd);
  const areaPath = pts.length > 0
    ? `M${t(pts[0]!.at)},${A.y + A.h - 4} ` + pts.map((p) => `L${t(p.at).toFixed(1)},${ay(p.remainingUsd).toFixed(1)}`).join(' ') + ` L${px.toFixed(1)},${ay(lastAlpha).toFixed(1)} L${px.toFixed(1)},${A.y + A.h - 4} Z`
    : '';
  const linePath = pts.length > 0
    ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${t(p.at).toFixed(1)},${ay(p.remainingUsd).toFixed(1)}`).join(' ') + ` L${px.toFixed(1)},${ay(lastAlpha).toFixed(1)}`
    : '';
  const alphaTone = lastAlpha > startAlphaUsd * 0.5 ? 'var(--so-alpha)' : lastAlpha > startAlphaUsd * 0.1 ? 'var(--so-amber)' : 'var(--so-red)';

  // Lane 2 · Shadow followers + competing flow
  const S = LANES.swarm;
  const sy = sizeScale([S.y + S.h - 12, S.y + 14]);
  const flows = state.flows;
  const flowMax = Math.max(1, ...flows.map((f) => f.sizeUsd));
  const fh = linear([0, flowMax], [0, S.h - 30]);

  // Lane 3 · Execution depth
  const D = LANES.depth;
  const depthStart = (state.market?.liquidityUsd ?? 0) / 2;
  const depthVals = pts.map((p) => p.depthUsd ?? depthStart);
  const dMax = Math.max(depthStart, ...depthVals, 1);
  const dy = linear([0, dMax], [D.y + D.h - 4, D.y + 8]);
  const depthPath = pts.length > 1 ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${t(p.at).toFixed(1)},${dy(p.depthUsd ?? depthStart).toFixed(1)}`).join(' ') + ` L${px.toFixed(1)},${dy(pts[pts.length - 1]!.depthUsd ?? depthStart).toFixed(1)}` : '';
  const depthNow = derived?.impliedDepthUsd ?? depthStart;

  const exit = state.sourceExits[0];
  const markers = state.markers.filter((m) => m.at > 0 && m.at <= nowAt);
  const running = phase === 'running';

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMinYMin meet"
      role="img"
      aria-label={`Flight recorder. Remaining Alpha ${fmtUsdWhole(lastAlpha)} of ${fmtUsdWhole(startAlphaUsd)}. ${flows.length} competing trades. Execution depth ${fmtUsdWhole(depthNow)}.`}
      className="block"
      style={{ fontFamily: 'var(--font-data)' }}
    >
      {/* time grid */}
      <g stroke="var(--so-line)" shapeRendering="crispEdges">
        {TIME_TICKS_MS.filter((ms) => ms <= durationMs).map((ms) => <line key={ms} x1={t(ms)} x2={t(ms)} y1={MARKERS.y + MARKERS.h} y2={D.y + D.h} />)}
        <line x1={GUTTER} x2={W - 20} y1={MARKERS.y + MARKERS.h} y2={MARKERS.y + MARKERS.h} stroke="var(--so-line-strong)" />
        <line x1={GUTTER} x2={W - 20} y1={A.y + A.h + 8} y2={A.y + A.h + 8} stroke="var(--so-line-strong)" />
        <line x1={GUTTER} x2={W - 20} y1={S.y + S.h + 8} y2={S.y + S.h + 8} stroke="var(--so-line-strong)" />
      </g>

      {/* lane labels */}
      <g fontSize={11} fill="var(--so-fg-muted)">
        <text x={0} y={MARKERS.y + 26}>EVENTS</text>
        <text x={0} y={A.y + 14}>REMAINING ALPHA</text>
        <text x={0} y={A.y + 30} fill="var(--so-fg-faint)">USD at your {(intent.delayMs / 1000).toFixed(1)} s delay</text>
        <text x={0} y={S.y + 14}>SHADOW FOLLOWERS</text>
        <text x={0} y={S.y + 30} fill="var(--so-fg-faint)">entry delay × size</text>
        <text x={0} y={S.y + 46} fill="var(--so-fg-faint)">bars: competing flow</text>
        <text x={0} y={D.y + 14}>EXECUTION DEPTH</text>
        <text x={0} y={D.y + 30} fill="var(--so-fg-faint)">implied by quotes</text>
      </g>

      {/* Lane 1 */}
      <g>
        <line x1={GUTTER} x2={W - 20} y1={ay(startAlphaUsd)} y2={ay(startAlphaUsd)} stroke="var(--so-alpha-dim)" strokeDasharray="3 5" />
        <text x={W - 24} y={ay(startAlphaUsd) - 6} fontSize={11} fill="var(--so-alpha-dim)" textAnchor="end">{fmtUsdWhole(startAlphaUsd)} estimated before test</text>
        {areaPath && <path d={areaPath} fill={alphaTone} opacity={0.14} style={reducedMotion ? undefined : { transition: 'fill 400ms ease-out' }} />}
        {linePath && <path d={linePath} fill="none" stroke={alphaTone} strokeWidth={2} strokeLinejoin="round" />}
        {pts.length > 0 && (
          <g>
            <circle cx={px} cy={ay(lastAlpha)} r={4} fill={alphaTone} />
            <text x={px > W - 110 ? px - 8 : px + 8} y={ay(lastAlpha) - 8} fontSize={12} fill={alphaTone} fontWeight={600} textAnchor={px > W - 110 ? 'end' : 'start'}>{fmtUsdWhole(lastAlpha)}</text>
          </g>
        )}
      </g>

      {/* Lane 2 */}
      <g>
        {flows.map((f) => (
          <rect key={f.txHash} x={t(f.delayMs) - 1.5} width={3} y={S.y + S.h - 8 - fh(f.sizeUsd)} height={fh(f.sizeUsd)} fill="var(--so-evidence)" opacity={0.45} />
        ))}
        {shadows.map((s) => {
          const entered = s.delayMs <= nowAt;
          return (
            <circle
              key={s.id}
              cx={t(s.delayMs)}
              cy={sy(s.sizeUsd)}
              r={entered ? 3.6 : 2.2}
              fill={entered ? evColor(s.evPct) : 'none'}
              stroke={entered ? 'none' : 'var(--so-line-strong)'}
              opacity={entered ? 0.95 : 0.7}
              style={reducedMotion ? undefined : { transition: 'fill 500ms ease-out, r 300ms ease-out' }}
            />
          );
        })}
        {/* your copy */}
        <g>
          <circle cx={t(intent.delayMs)} cy={sy(intent.sizeUsd)} r={8} fill="none" stroke="var(--so-amber)" strokeWidth={2} />
          <line x1={t(intent.delayMs)} x2={t(intent.delayMs)} y1={S.y + 8} y2={S.y + S.h - 4} stroke="var(--so-amber)" strokeWidth={1} strokeDasharray="2 4" />
          <text x={t(intent.delayMs) + 12} y={sy(intent.sizeUsd) + 4} fontSize={11} fill="var(--so-amber)">you · {fmtUsdWhole(intent.sizeUsd)}</text>
        </g>
      </g>

      {/* Lane 3 */}
      <g>
        <line x1={GUTTER} x2={W - 20} y1={dy(depthStart)} y2={dy(depthStart)} stroke="var(--so-line-strong)" strokeDasharray="3 5" />
        <text x={W - 24} y={dy(depthStart) - 5} fontSize={11} fill="var(--so-fg-faint)" textAnchor="end">{fmtUsdWhole(depthStart)} reported liquidity ÷ 2</text>
        {depthPath && <path d={depthPath} fill="none" stroke="var(--so-amber)" strokeWidth={2} strokeLinejoin="round" />}
        {pts.length > 0 && <text x={Math.min(px + 8, W - 24)} y={Math.min(dy(depthNow) - 8, D.y + D.h - 6)} fontSize={12} fill="var(--so-amber)" fontWeight={600} textAnchor={px > W - 110 ? 'end' : 'start'}>{fmtUsdWhole(depthNow)}</text>}
      </g>

      {/* markers strip: flags stack in two rows so labels never collide */}
      {markers.map((m, i) => {
        const row = i % 2;
        const label = m.label.length > 44 ? m.label.slice(0, 43) + '…' : m.label;
        const w = Math.min(300, label.length * 6.4 + 14);
        const xFlag = Math.min(t(m.at) + 3, W - 20 - w);
        const critical = m.severity === 'critical';
        return (
          <g key={m.id}>
            <line x1={t(m.at)} x2={t(m.at)} y1={MARKERS.y + 4 + row * 20} y2={D.y + D.h} stroke={critical ? 'var(--so-red)' : 'var(--so-amber-dim)'} strokeWidth={critical ? 1.5 : 1} strokeDasharray={critical ? undefined : '3 3'} />
            <rect x={xFlag} y={MARKERS.y + 4 + row * 20} width={w} height={17} fill={critical ? 'var(--so-red)' : 'var(--so-bg-raised)'} stroke={critical ? 'none' : 'var(--so-line-strong)'} />
            <text x={xFlag + 7} y={MARKERS.y + 16 + row * 20} fontSize={10.5} fill={critical ? 'var(--so-bg-sunken)' : 'var(--so-fg-muted)'} fontWeight={critical ? 600 : 400}>{label}</text>
          </g>
        );
      })}
      {exit && <text x={Math.min(t(exit.delayMs) + 6, W - 150)} y={S.y + S.h - 4} fontSize={11} fill="var(--so-red)">source sold {Math.round(exit.fractionOfPosition * 100)}% · {fmtUsdWhole(exit.sizeUsd)}</text>}

      {/* playhead */}
      {(running || phase === 'ended') && (
        <g>
          <line x1={px} x2={px} y1={MARKERS.y + MARKERS.h} y2={D.y + D.h + 4} stroke="var(--so-fg)" strokeWidth={1} />
          <rect x={px - 30} y={D.y + D.h + 6} width={60} height={16} fill="var(--so-fg)" />
          <text x={px} y={D.y + D.h + 18} fontSize={11} fill="var(--so-bg-sunken)" textAnchor="middle" fontWeight={600}>T+{(nowAt / 1000).toFixed(1)}s</text>
        </g>
      )}

      {/* time axis */}
      <g fontSize={11} fill="var(--so-fg-muted)">
        {TIME_TICKS_MS.filter((ms) => ms <= durationMs).map((ms) => (
          <text key={ms} x={t(ms)} y={H - 4} textAnchor={ms === 0 ? 'start' : 'middle'} opacity={Math.abs(t(ms) - px) < 34 && (running || phase === 'ended') ? 0 : 1}>{tickLabel(ms)}</text>
        ))}
      </g>
    </svg>
  );
}
