'use client';
import type { CapacityCurvePoint, DerivedInputs, ScenarioState, ShadowOutcome } from '@second-order/core';
import { fmtDelay, fmtUsdWhole } from '@/lib/format';
import { Bar, toneClass, toneForEv, toneForLevel, type Tone } from './primitives';

const CELLS = 40;

/** Remaining Alpha as a draining block meter. */
export function AlphaMeter({ remainingUsd, startUsd, delayMs }: { remainingUsd: number | null; startUsd: number; delayMs: number }) {
  const v = remainingUsd ?? 0;
  const filled = startUsd > 0 ? (v / startUsd) * CELLS : 0;
  const tone = remainingUsd === null ? 'dim' : toneForLevel(v, startUsd);
  return (
    <div className="grid grid-cols-[17ch_auto_1fr] items-baseline gap-x-3">
      <span className="bios-label">REMAINING ALPHA</span>
      <Bar filled={filled} total={CELLS} tone={tone} label={`Remaining alpha ${fmtUsdWhole(v)} of ${fmtUsdWhole(startUsd)}`} />
      <span className="truncate">
        <span className={toneClass[tone]}>{remainingUsd === null ? '—' : fmtUsdWhole(v)}</span>
        <span className="text-bios-fg"> of {fmtUsdWhole(startUsd)} at {fmtDelay(delayMs)}</span>
      </span>
    </div>
  );
}

export function FlowAndDepth({ derived, state }: { derived: DerivedInputs | null; state: ScenarioState }) {
  const flow = derived?.competingFlowUsd ?? 0;
  const count = derived?.competingFlowCount ?? 0;
  const source = state.sourceTrade?.sizeUsd ?? 1;
  const flowCells = Math.min(CELLS, (flow / Math.max(source * 4, 1)) * CELLS);
  const depthStart = (state.market?.liquidityUsd ?? 0) / 2;
  const depth = derived?.impliedDepthUsd ?? depthStart;
  const depthCells = depthStart > 0 ? (depth / depthStart) * CELLS : 0;
  const depthTone: Tone = depthStart <= 0 ? 'dim' : depth > depthStart * 0.5 ? 'cyan' : depth > depthStart * 0.15 ? 'yellow' : 'red';
  return (
    <>
      <div className="grid grid-cols-[17ch_auto_1fr] items-baseline gap-x-3">
        <span className="bios-label">COMPETING FLOW</span>
        <Bar filled={flowCells} total={CELLS} tone={flow > source * 2 ? 'yellow' : 'cyan'} label={`Competing flow ${fmtUsdWhole(flow)}`} />
        <span className="truncate text-bios-fg">{fmtUsdWhole(flow)} · {count} same-direction trades</span>
      </div>
      <div className="grid grid-cols-[17ch_auto_1fr] items-baseline gap-x-3">
        <span className="bios-label">EXEC DEPTH</span>
        <Bar filled={depthCells} total={CELLS} tone={depthTone} label={`Execution depth ${fmtUsdWhole(depth)}`} />
        <span className="truncate text-bios-fg">{depthStart > 0 ? `${fmtUsdWhole(depth)} of ${fmtUsdWhole(depthStart)} reported` : 'no market snapshot'}</span>
      </div>
    </>
  );
}

/**
 * 100 shadow followers as a cell grid: columns are delay buckets (left = earliest),
 * rows are size buckets (top = largest). A cell fills with its outcome colour once the
 * recorder has passed that follower's delay. It reads like a memory test, and it is one:
 * sampled scenarios, not wallets.
 */
export function FollowerGrid({ shadows, nowAt, intent, cols, colLabels }: { shadows: ShadowOutcome[]; nowAt: number; intent: { delayMs: number; sizeUsd: number }; cols: number; colLabels: string[] }) {
  const rows = Math.ceil(shadows.length / cols);
  const byRow: ShadowOutcome[][] = Array.from({ length: rows }, () => []);
  for (const s of shadows) byRow[Math.floor(s.id / cols)]!.push(s);
  const userCol = Math.min(cols - 1, Math.max(0, Math.floor((Math.log(intent.delayMs / 300) / Math.log(45_000 / 300)) * cols)));
  const userRow = Math.min(rows - 1, Math.max(0, Math.floor((Math.log(intent.sizeUsd / 50) / Math.log(5000 / 50)) * rows)));
  const entered = shadows.filter((s) => s.delayMs <= nowAt).length;
  const rowLabel = (r: number) => (r === rows - 1 ? '$5000' : r === 0 ? '$50' : r === Math.floor(rows / 2) ? '$500' : '');
  const cellBg: Record<Tone, string> = { green: 'var(--bios-green)', yellow: 'var(--bios-yellow)', red: 'var(--bios-red)', cyan: 'var(--bios-cyan)', white: 'var(--bios-white)', dim: 'transparent', fg: 'var(--bios-fg)' };
  return (
    <div className="grid grid-cols-[17ch_1fr] gap-x-3" role="img" aria-label={`Shadow followers: ${entered} of ${shadows.length} entered`}>
      <div>
        <div className="bios-label">SHADOW FOLLOWERS</div>
        <div className="text-bios-fg">{entered}/{shadows.length} entered</div>
        <div className="text-bios-dim">rows: size ↓</div>
        <div className="text-bios-dim">cols: delay →</div>
      </div>
      <div>
        {[...byRow].reverse().map((row, ri) => {
          const r = rows - 1 - ri;
          return (
            <div key={r} className="flex items-center gap-x-3" style={{ height: '1.15em' }}>
              <span className="w-[6ch] text-right text-bios-fg">{rowLabel(r)}</span>
              <span className="flex" style={{ gap: '0.18em' }}>
                {row.map((s, ci) => {
                  const on = s.delayMs <= nowAt;
                  const you = ci === userCol && r === userRow;
                  return (
                    <span
                      key={s.id}
                      title={`#${s.id + 1} ${fmtUsdWhole(s.sizeUsd)} at ${fmtDelay(s.delayMs)}${on ? ` → ${s.evPct.toFixed(1)}%` : ''}`}
                      className="inline-block"
                      style={{
                        width: '1.05em', height: '0.8em',
                        background: on ? cellBg[toneForEv(s.evPct)] : 'repeating-linear-gradient(45deg, var(--bios-dim) 0 1px, transparent 1px 3px)',
                        outline: you ? '2px solid var(--bios-white)' : undefined, outlineOffset: you ? '1px' : undefined,
                      }}
                    />
                  );
                })}
              </span>
            </div>
          );
        })}
        <div className="flex items-baseline gap-x-3 text-bios-fg">
          <span className="w-[6ch]" />
          <span className="flex" style={{ gap: '0.18em' }}>
            {Array.from({ length: cols }, (_, i) => <span key={i} className="inline-block text-center" style={{ width: '1.05em', fontSize: '0.75em' }}>{colLabels[i] ?? ''}</span>)}
          </span>
        </div>
      </div>
    </div>
  );
}

const LOG_MIN = 25;
const LOG_MAX = 20_000;

/** CAPACITY MAP C(delay): one row per delay, block bar on a log dollar scale. */
export function CapacityMap({ curve, intent, maxCompatibleUsd }: { curve: CapacityCurvePoint[]; intent: { delayMs: number; sizeUsd: number }; maxCompatibleUsd: number | null }) {
  const MAP_CELLS = 24;
  const rows = curve.filter((c) => [500, 1200, 2000, 5000, 8000, 20_000, 45_000].includes(c.delayMs));
  const cells = (usd: number) => (usd <= 0 ? 0 : Math.max(1, Math.round((Math.log(Math.min(LOG_MAX, Math.max(LOG_MIN, usd)) / LOG_MIN) / Math.log(LOG_MAX / LOG_MIN)) * MAP_CELLS)));
  const userCells = cells(intent.sizeUsd);
  return (
    <div className="grid grid-cols-[13ch_1fr] gap-x-3">
      <div>
        <div className="bios-label">CAPACITY MAP</div>
        <div className="text-bios-dim">C(delay) · ▲ you</div>
        <div className="text-bios-dim">* = estimated</div>
      </div>
      <div className="bios-cells leading-[1.05]">
        {rows.map((c) => {
          const tone: Tone = c.capacityUsd <= 0 ? 'red' : c.capacityUsd >= intent.sizeUsd ? 'green' : c.capacityUsd >= intent.sizeUsd / 2 ? 'yellow' : 'red';
          const active = Math.abs(Math.log(c.delayMs / intent.delayMs)) < 0.35;
          return (
            <div key={c.delayMs} className={`flex items-baseline gap-x-3 ${active ? 'bios-selected -mx-1 px-1' : ''}`}>
              <span className={`w-[6ch] text-right ${active ? '' : 'text-bios-fg'}`}>{fmtDelay(c.delayMs).replace(' ', '')}</span>
              <Bar filled={cells(c.capacityUsd)} total={MAP_CELLS} tone={tone} label={`Capacity at ${fmtDelay(c.delayMs)}: ${fmtUsdWhole(c.capacityUsd)}`} />
              <span className={active ? '' : toneClass[tone]}>CAP {c.capacityUsd > 0 ? fmtUsdWhole(c.capacityUsd) : 'NONE'}{c.confidence !== 'observed' ? '*' : ''}</span>
            </div>
          );
        })}
        <div className="flex items-baseline gap-x-3 text-bios-fg">
          <span className="w-[6ch]" />
          <span className="bios-cells">{' '.repeat(Math.max(0, userCells - 1))}<span className="text-bios-yellow">▲</span>{' '.repeat(Math.max(0, MAP_CELLS - userCells))}</span>
          <span className="text-bios-dim">{maxCompatibleUsd !== null ? `max ${maxCompatibleUsd > 0 ? fmtUsdWhole(maxCompatibleUsd) : 'NONE'} at ${fmtDelay(intent.delayMs)}` : ''}</span>
        </div>
      </div>
    </div>
  );
}
