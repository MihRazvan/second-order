import { demoFrames } from '@/lib/demo-snapshot';
import { fmtUsdWhole } from '@/lib/format';
import { delayScale, sizeScale, linear } from '@/viz/scales';
import { LogGrid, SwarmMarks } from '@/viz/swarm';
import { facts } from '../_shared';

/**
 * Direction A — Laboratory instrument.
 * A specimen label, a scope chamber holding the shadow-follower swarm with the
 * capacity boundary drawn through it, and a graduated burette for Remaining Alpha.
 */
export default function DirectionA() {
  const frames = demoFrames();
  const f = facts(frames);
  const end = frames.end;

  // Chamber geometry
  const W = 760, H = 520, m = { l: 64, r: 24, t: 20, b: 44 };
  const x = delayScale([m.l, W - m.r]);
  const y = sizeScale([H - m.b, m.t]);
  const curvePath = end.curve
    .filter((p) => p.capacityUsd > 0)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.delayMs).toFixed(1)},${y(Math.max(50, Math.min(5000, p.capacityUsd))).toFixed(1)}`)
    .join(' ');

  // Burette geometry
  const BH = 420;
  const level = linear([0, f.startAlphaUsd], [BH, 0]);
  const fillY = level(f.endAlphaUsd);

  return (
    <main className="min-h-screen bg-bg text-fg" style={{ fontFamily: 'var(--font-ui)' }}>
      <header className="flex items-baseline justify-between border-b border-line px-8 py-3">
        <div className="flex items-baseline gap-6">
          <span className="text-[15px] font-semibold tracking-tight">Second Order</span>
          <span className="text-fg-muted">Alpha Crash Test</span>
        </div>
        <div className="font-data flex items-center gap-5 text-[12px] text-fg-muted">
          <span>{f.provenance}</span>
          <span>Replay 4×</span>
          <span>00:60.0</span>
        </div>
      </header>

      <section className="grid grid-cols-[300px_760px_1fr] gap-6 px-8 pt-6">
        {/* Specimen label */}
        <div className="border border-line-strong bg-bg-raised">
          <div className="border-b border-line-strong px-4 py-3">
            <div className="text-[12px] text-fg-muted">Tracked wallet</div>
            <div className="font-data mt-1 text-[15px]">{f.walletShort}</div>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-y-2 px-4 py-3 text-[13px]">
            <dt className="text-fg-muted">Realized, {f.periodDays}d</dt>
            <dd className="font-data text-alpha text-[22px] leading-none">{f.roi}</dd>
            <dt className="text-fg-muted">Trades</dt>
            <dd className="font-data">{f.trades}</dd>
            <dt className="text-fg-muted">Win rate</dt>
            <dd className="font-data">{f.winRate}%</dd>
          </dl>
          <div className="border-t border-line px-4 py-3 text-[13px]">
            <div className="text-fg-muted">Source trade</div>
            <div className="font-data mt-1">BUY {f.token} · {f.sourceSize}</div>
            <div className="font-data text-fg-muted">{f.chain} · {f.quote} pool</div>
          </div>
          <div className="border-t border-line px-4 py-3 text-[13px]">
            <div className="text-fg-muted">Security</div>
            <div className="font-data mt-1 text-evidence">honeypot no · tax 0/0 · LP locked 82%</div>
          </div>
          <div className="border-t border-line px-4 py-3">
            <button className="w-full bg-fg py-2.5 text-[14px] font-medium text-bg-sunken" type="button">Crash test this wallet</button>
          </div>
        </div>

        {/* Chamber */}
        <figure className="relative border border-line-strong bg-bg-sunken">
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Shadow-follower simulation: 100 sampled scenarios by delay and size, coloured by scenario-adjusted outcome">
            <LogGrid x={x} y={y} delays={[500, 1000, 2000, 5000, 10000, 20000]} sizes={[100, 250, 500, 1000, 2500]} x0={m.l} x1={W - m.r} y0={m.t} y1={H - m.b} />
            <path d={curvePath} fill="none" stroke="var(--so-alpha)" strokeWidth={2} strokeDasharray="6 4" />
            <SwarmMarks shadows={end.shadows} x={x} y={y} r={4.5} />
            {/* Your copy */}
            <g>
              <line x1={x(5000)} x2={x(5000)} y1={m.t} y2={H - m.b} stroke="var(--so-amber)" strokeWidth={1} strokeDasharray="2 3" />
              <line x1={m.l} x2={W - m.r} y1={y(1000)} y2={y(1000)} stroke="var(--so-amber)" strokeWidth={1} strokeDasharray="2 3" />
              <circle cx={x(5000)} cy={y(1000)} r={9} fill="none" stroke="var(--so-amber)" strokeWidth={2} />
              <text x={x(5000) + 14} y={y(1000) - 12} fill="var(--so-amber)" fontSize={12} fontFamily="var(--font-data)">your copy · $1,000 at 5 s → {f.userEv}</text>
            </g>
            {/* Axes */}
            <g fontFamily="var(--font-data)" fontSize={11} fill="var(--so-fg-muted)">
              {[500, 1000, 2000, 5000, 10000, 20000].map((d) => <text key={d} x={x(d)} y={H - 18} textAnchor="middle">{d >= 1000 ? `${d / 1000}s` : `${d}ms`}</text>)}
              {[100, 250, 500, 1000, 2500].map((s) => <text key={s} x={m.l - 8} y={y(s) + 4} textAnchor="end">${s}</text>)}
              <text x={W - m.r} y={H - 4} textAnchor="end">delay behind source</text>
              <text x={m.l} y={12} textAnchor="start">follower size</text>
            </g>
          </svg>
          <figcaption className="flex items-center justify-between border-t border-line px-4 py-2 text-[12px] text-fg-muted">
            <span>Shadow-follower simulation · 100 sampled scenarios · dashed line = maximum scenario-compatible size</span>
            <span className="font-data">{f.competingCount} competing trades · {f.competingFlow}</span>
          </figcaption>
        </figure>

        {/* Burette + verdict */}
        <div className="flex flex-col gap-4">
          <div className="flex gap-4 border border-line-strong bg-bg-raised p-4">
            <svg width={64} height={BH + 24} viewBox={`0 0 64 ${BH + 24}`} aria-label={`Remaining Alpha ${f.endAlpha} of ${f.startAlpha}`}>
              <rect x={20} y={12} width={24} height={BH} fill="var(--so-bg-sunken)" stroke="var(--so-line-strong)" />
              <rect x={20} y={12 + fillY} width={24} height={BH - fillY} fill="var(--so-red)" />
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <g key={t}><line x1={44} x2={54} y1={12 + BH * (1 - t)} y2={12 + BH * (1 - t)} stroke="var(--so-fg-faint)" /><text x={58} y={16 + BH * (1 - t)} fontSize={10} fill="var(--so-fg-faint)" fontFamily="var(--font-data)">{Math.round(t * 100)}</text></g>
              ))}
            </svg>
            <div className="flex flex-col justify-between">
              <div>
                <div className="text-[12px] text-fg-muted">Remaining Alpha</div>
                <div className="font-data text-red text-[34px] leading-none">{f.endAlpha}</div>
                <div className="font-data mt-1 text-[12px] text-fg-muted">of {f.startAlpha} estimated at start</div>
              </div>
              <div className="text-[12px] text-fg-muted">at your 5 s delay</div>
            </div>
          </div>
          <div className="border-2 border-red bg-bg-raised p-4">
            <div className="text-red text-[13px] font-semibold tracking-wide">CROWD CAPTURE RISK</div>
            <div className="mt-2 text-[15px]">{f.userSize} scenario outcome</div>
            <div className="font-data text-red text-[30px] leading-none">{f.userEv}</div>
            <div className="mt-3 text-[13px] text-fg-muted">Maximum scenario-compatible size</div>
            <div className="font-data text-[22px]">{f.maxCompatible}</div>
            <div className="mt-4 flex gap-2">
              <button className="flex-1 bg-fg py-2 text-[13px] font-medium text-bg-sunken" type="button">Resize to {f.maxCompatible}</button>
              <button className="flex-1 border border-line-strong py-2 text-[13px]" type="button">Block wallet</button>
            </div>
          </div>
        </div>
      </section>

      <section className="font-data grid grid-cols-3 gap-6 px-8 pt-5 text-[12px] text-fg-muted">
        <div>Competing flow entered <span className="text-fg">{f.competingFlow}</span> across {f.competingCount} trades</div>
        <div>Execution depth <span className="text-fg">{f.depthStart} → {f.depthEnd}</span> (observed quotes)</div>
        <div>Source-exit overlap <span className="text-fg">{f.exitFraction}% sold at {f.exitAtS} s</span>, {f.exitRatio} vs entry</div>
      </section>
    </main>
  );
}
