'use client';
import { useId } from 'react';
import type { CapacityCurvePoint } from '@second-order/core';
import { fmtDelay, fmtUsdWhole } from '@/lib/format';
import { delayScale, linear } from '@/viz/scales';
import { scaleLog } from 'd3-scale';

interface Props {
  intent: { sizeUsd: number; delayMs: number };
  extraCrowdUsd: number;
  onSize: (v: number) => void;
  onDelay: (v: number) => void;
  onExtraCrowd: (v: number) => void;
  curve: CapacityCurvePoint[];
  crowdCurve: CapacityCurvePoint[] | null;
  maxCompatibleUsd: number | null;
  disabledNote?: string;
}

const DELAY_MIN = 300, DELAY_MAX = 45_000;
const toSlider = (ms: number) => Math.round(((Math.log(ms) - Math.log(DELAY_MIN)) / (Math.log(DELAY_MAX) - Math.log(DELAY_MIN))) * 1000);
const fromSlider = (v: number) => Math.exp(Math.log(DELAY_MIN) + (v / 1000) * (Math.log(DELAY_MAX) - Math.log(DELAY_MIN)));

/** User-local inputs. These values never leave the browser. */
export function Controls({ intent, extraCrowdUsd, onSize, onDelay, onExtraCrowd, curve, crowdCurve, maxCompatibleUsd }: Props) {
  const sizeId = useId(), delayId = useId(), crowdId = useId();
  const W = 420, H = 118, m = { l: 44, r: 12, t: 10, b: 26 };
  const x = delayScale([m.l, W - m.r]);
  const yMax = Math.max(1000, ...curve.map((c) => c.capacityUsd), intent.sizeUsd * 1.2);
  const y = scaleLog().domain([10, yMax]).range([H - m.b, m.t]).clamp(true);
  // Zero capacity is drawn as a gap in the line and a red tick on the baseline, never as a fake floor.
  const path = (pts: CapacityCurvePoint[]) => {
    let d = '';
    let pen = false;
    for (const c of pts) {
      if (c.capacityUsd <= 0) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${x(c.delayMs).toFixed(1)},${y(c.capacityUsd).toFixed(1)} `;
      pen = true;
    }
    return d;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="grid gap-4 sm:grid-cols-3">
        <label htmlFor={sizeId} className="block">
          <span className="text-[12px] text-fg-muted">Intended size</span>
          <span className="mt-1 flex items-baseline border-b border-line-strong focus-within:border-amber">
            <span className="font-data text-[18px] text-fg-muted">$</span>
            <input
              id={sizeId}
              type="number"
              inputMode="numeric"
              min={1}
              step={10}
              value={intent.sizeUsd}
              onChange={(e) => onSize(Number(e.target.value) || 0)}
              className="font-data w-full bg-transparent py-1.5 text-[18px] text-fg outline-none"
              aria-describedby={`${sizeId}-note`}
            />
          </span>
          <span id={`${sizeId}-note`} className="mt-1 block text-[11px] text-fg-faint">stays in this browser</span>
        </label>
        <label htmlFor={delayId} className="block">
          <span className="flex items-baseline justify-between text-[12px] text-fg-muted"><span>Delay behind source</span><span className="font-data text-fg">{fmtDelay(intent.delayMs)}</span></span>
          <input id={delayId} type="range" min={0} max={1000} value={toSlider(intent.delayMs)} onChange={(e) => onDelay(fromSlider(Number(e.target.value)))} className="so-range mt-3 w-full" aria-valuetext={fmtDelay(intent.delayMs)} />
          <span className="mt-1 flex justify-between text-[11px] text-fg-faint"><span>0.3 s</span><span>45 s</span></span>
        </label>
        <label htmlFor={crowdId} className="block">
          <span className="flex items-baseline justify-between text-[12px] text-fg-muted"><span>Additional crowd</span><span className="font-data text-fg">{extraCrowdUsd ? `+${fmtUsdWhole(extraCrowdUsd)}` : 'none'}</span></span>
          <input id={crowdId} type="range" min={0} max={50_000} step={500} value={extraCrowdUsd} onChange={(e) => onExtraCrowd(Number(e.target.value))} className="so-range mt-3 w-full" aria-valuetext={extraCrowdUsd ? `+${fmtUsdWhole(extraCrowdUsd)}` : 'none'} />
          <span className="mt-1 block text-[11px] text-fg-faint">hypothetical same-direction flow ahead of you</span>
        </label>
      </div>

      <figure className="min-w-0">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Maximum scenario-compatible size by delay" style={{ fontFamily: 'var(--font-data)' }}>
          <g stroke="var(--so-line)" shapeRendering="crispEdges">
            {[1000, 5000, 20000].map((d) => <line key={d} x1={x(d)} x2={x(d)} y1={m.t} y2={H - m.b} />)}
            {[100, 1000, 10000].filter((v) => v <= yMax).map((v) => <line key={v} x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} />)}
          </g>
          {crowdCurve && <path d={path(crowdCurve)} fill="none" stroke="var(--so-amber)" strokeWidth={1.5} strokeDasharray="4 3" />}
          <path d={path(curve)} fill="none" stroke="var(--so-alpha)" strokeWidth={2} strokeLinejoin="round" />
          {curve.map((c) => <circle key={c.delayMs} cx={x(c.delayMs)} cy={c.capacityUsd > 0 ? y(c.capacityUsd) : H - m.b} r={c.capacityUsd > 0 ? 2 : 2.5} fill={c.capacityUsd > 0 ? 'var(--so-alpha)' : 'var(--so-red)'} />)}
          <line x1={x(intent.delayMs)} x2={x(intent.delayMs)} y1={m.t} y2={H - m.b} stroke="var(--so-amber)" strokeDasharray="2 4" />
          <circle cx={x(intent.delayMs)} cy={y(Math.max(10, intent.sizeUsd))} r={5} fill="none" stroke="var(--so-amber)" strokeWidth={2} />
          {maxCompatibleUsd !== null && maxCompatibleUsd > 0 && <circle cx={x(intent.delayMs)} cy={y(maxCompatibleUsd)} r={3} fill="var(--so-alpha)" />}
          <g fontSize={10} fill="var(--so-fg-muted)">
            {[1000, 5000, 20000].map((d) => <text key={d} x={x(d)} y={H - 10} textAnchor="middle">{d / 1000} s</text>)}
            {[100, 1000, 10000].filter((v) => v <= yMax).map((v) => <text key={v} x={m.l - 6} y={y(v) + 3} textAnchor="end">${v >= 1000 ? `${v / 1000}k` : v}</text>)}
          </g>
        </svg>
        <figcaption className="mt-1 flex justify-between text-[11px] text-fg-faint">
          <span>Maximum scenario-compatible size by delay</span>
          <span>{crowdCurve ? 'dashed: with additional crowd · red: none' : 'red tick: no compatible size'}</span>
        </figcaption>
      </figure>
    </div>
  );
}

export { linear };
