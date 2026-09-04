import { demoFrames, demoTimeline } from '@/lib/demo-snapshot';
import { fmtUsdWhole } from '@/lib/format';
import { evColor, linear, sizeScale } from '@/viz/scales';
import { facts } from '../_shared';

/**
 * Direction B — Crash telemetry / flight recorder.
 * One time axis across the page. Stacked recorder lanes: Remaining Alpha draining,
 * competing flow arriving, execution depth collapsing. Followers board along the
 * time axis. The verdict is an annunciator panel.
 */
export default function DirectionB() {
  const frames = demoFrames();
  const f = facts(frames);
  const tl = demoTimeline(1000);
  const end = frames.end;
  const flows = end.state.flows;
  const exit = end.state.sourceExits[0];

  const W = 1120, LANE_X = 120;
  const t = linear([0, 60_000], [LANE_X, W - 16]);

  // Lane 1: remaining alpha (area)
  const L1 = { y: 0, h: 150 };
  const ra = linear([0, f.startAlphaUsd], [L1.h - 6, 6]);
  const raArea = `M${t(0)},${L1.h - 6} ` + tl.map((p) => `L${t(p.at).toFixed(1)},${ra(p.remainingUsd).toFixed(1)}`).join(' ') + ` L${t(60_000)},${L1.h - 6} Z`;
  const raLine = tl.map((p, i) => `${i === 0 ? 'M' : 'L'}${t(p.at).toFixed(1)},${ra(p.remainingUsd).toFixed(1)}`).join(' ');

  // Lane 2: followers boarding (x = delay, y = size) + competing flow bars
  const L2 = { y: 160, h: 170 };
  const sz = sizeScale([L2.y + L2.h - 10, L2.y + 10]);
  const flowMax = Math.max(...flows.map((x) => x.sizeUsd));
  const fh = linear([0, flowMax], [0, L2.h - 20]);

  // Lane 3: depth
  const L3 = { y: 340, h: 110 };
  const depthVals = tl.map((p) => p.depthUsd ?? f.startAlphaUsd * 8);
  const dp = linear([0, Math.max(...depthVals)], [L3.y + L3.h - 8, L3.y + 8]);
  const depthLine = tl.map((p, i) => `${i === 0 ? 'M' : 'L'}${t(p.at).toFixed(1)},${dp(p.depthUsd ?? depthVals[0]!).toFixed(1)}`).join(' ');

  const H = 470;
  const exitX = exit ? t(exit.delayMs) : null;

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
          <span className="text-fg">T+60.0 s</span>
        </div>
      </header>

      {/* Readout row */}
      <section className="grid grid-cols-[1fr_1fr_1fr_420px] gap-px border-b border-line bg-line">
        <div className="bg-bg px-8 py-5">
          <div className="text-[12px] text-fg-muted">Tracked wallet · {f.walletShort}</div>
          <div className="font-data mt-1 text-[38px] leading-none text-alpha">{f.roi}</div>
          <div className="mt-1 text-[12px] text-fg-muted">realized over {f.periodDays} days · {f.trades} trades</div>
        </div>
        <div className="bg-bg px-8 py-5">
          <div className="text-[12px] text-fg-muted">Remaining Alpha at 5 s</div>
          <div className="font-data mt-1 text-[38px] leading-none text-red">{f.endAlpha}</div>
          <div className="mt-1 text-[12px] text-fg-muted">from {f.startAlpha} estimated before the test</div>
        </div>
        <div className="bg-bg px-8 py-5">
          <div className="text-[12px] text-fg-muted">Your $1,000 copy at 5 s</div>
          <div className="font-data mt-1 text-[38px] leading-none text-red">{f.userEv}</div>
          <div className="mt-1 text-[12px] text-fg-muted">scenario-adjusted outcome</div>
        </div>
        <div className="flex items-center gap-4 bg-bg-raised px-6 py-4">
          <div className="h-full w-1.5 bg-red" aria-hidden />
          <div className="flex-1">
            <div className="text-red text-[13px] font-semibold tracking-wide">CROWD CAPTURE RISK</div>
            <div className="mt-1 text-[13px] text-fg-muted">Maximum scenario-compatible size <span className="font-data text-fg">{f.maxCompatible}</span></div>
            <div className="mt-3 flex gap-2">
              <button className="bg-fg px-3 py-1.5 text-[13px] font-medium text-bg-sunken" type="button">Resize to {f.maxCompatible}</button>
              <button className="border border-line-strong px-3 py-1.5 text-[13px]" type="button">Block wallet</button>
            </div>
          </div>
        </div>
      </section>

      {/* Recorder */}
      <section className="px-8 pt-4">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Flight-recorder lanes over 60 seconds: Remaining Alpha, shadow followers and competing flow, execution depth">
          {/* time grid */}
          <g stroke="var(--so-line)" shapeRendering="crispEdges">
            {[0, 10, 20, 30, 40, 50, 60].map((s) => <line key={s} x1={t(s * 1000)} x2={t(s * 1000)} y1={0} y2={H - 20} />)}
          </g>
          {/* Lane 1 */}
          <g>
            <text x={0} y={14} fontSize={11} fill="var(--so-fg-muted)" fontFamily="var(--font-data)">REMAINING ALPHA</text>
            <text x={0} y={30} fontSize={11} fill="var(--so-fg-faint)" fontFamily="var(--font-data)">USD at 5 s delay</text>
            <path d={raArea} fill="var(--so-alpha)" opacity={0.12} />
            <path d={raLine} fill="none" stroke="var(--so-alpha)" strokeWidth={2} />
            <text x={t(0) + 6} y={ra(f.startAlphaUsd) + 12} fontSize={11} fill="var(--so-alpha)" fontFamily="var(--font-data)">{f.startAlpha}</text>
            <text x={t(60_000) - 6} y={ra(f.endAlphaUsd) - 8} fontSize={11} fill="var(--so-red)" fontFamily="var(--font-data)" textAnchor="end">{f.endAlpha}</text>
            <line x1={LANE_X} x2={W - 16} y1={L1.h + 4} y2={L1.h + 4} stroke="var(--so-line-strong)" />
          </g>
          {/* Lane 2 */}
          <g>
            <text x={0} y={L2.y + 14} fontSize={11} fill="var(--so-fg-muted)" fontFamily="var(--font-data)">SHADOW FOLLOWERS</text>
            <text x={0} y={L2.y + 30} fontSize={11} fill="var(--so-fg-faint)" fontFamily="var(--font-data)">entry by delay · size</text>
            <text x={0} y={L2.y + 46} fontSize={11} fill="var(--so-fg-faint)" fontFamily="var(--font-data)">bars: competing flow</text>
            {flows.map((fl) => <rect key={fl.txHash} x={t(fl.delayMs) - 1.5} width={3} y={L2.y + L2.h - 8 - fh(fl.sizeUsd)} height={fh(fl.sizeUsd)} fill="var(--so-evidence)" opacity={0.55} />)}
            {end.shadows.map((s) => <circle key={s.id} cx={t(s.delayMs)} cy={sz(s.sizeUsd)} r={3.5} fill={evColor(s.evPct)} opacity={0.9} />)}
            <circle cx={t(5000)} cy={sz(1000)} r={8} fill="none" stroke="var(--so-amber)" strokeWidth={2} />
            <text x={t(5000) + 12} y={sz(1000) - 10} fontSize={11} fill="var(--so-amber)" fontFamily="var(--font-data)">you · $1,000 · 5 s</text>
            <line x1={LANE_X} x2={W - 16} y1={L2.y + L2.h + 4} y2={L2.y + L2.h + 4} stroke="var(--so-line-strong)" />
          </g>
          {/* Lane 3 */}
          <g>
            <text x={0} y={L3.y + 14} fontSize={11} fill="var(--so-fg-muted)" fontFamily="var(--font-data)">EXECUTION DEPTH</text>
            <text x={0} y={L3.y + 30} fontSize={11} fill="var(--so-fg-faint)" fontFamily="var(--font-data)">implied by quotes</text>
            <path d={depthLine} fill="none" stroke="var(--so-amber)" strokeWidth={2} />
            <text x={t(60_000) - 6} y={dp(depthVals[depthVals.length - 1]!) - 6} fontSize={11} fill="var(--so-amber)" fontFamily="var(--font-data)" textAnchor="end">{f.depthEnd}</text>
            <text x={t(1000) + 6} y={dp(depthVals[1]!) + 14} fontSize={11} fill="var(--so-fg-muted)" fontFamily="var(--font-data)">{f.depthStart}</text>
          </g>
          {/* Source exit flag */}
          {exitX !== null && (
            <g>
              <line x1={exitX} x2={exitX} y1={0} y2={H - 20} stroke="var(--so-red)" strokeWidth={1.5} />
              <rect x={exitX + 4} y={L1.h + 12} width={196} height={20} fill="var(--so-red)" />
              <text x={exitX + 10} y={L1.h + 26} fontSize={11} fill="var(--so-bg-sunken)" fontFamily="var(--font-data)" fontWeight={600}>SOURCE EXIT {f.exitFraction}% · overlap</text>
            </g>
          )}
          {/* time axis */}
          <g fontFamily="var(--font-data)" fontSize={11} fill="var(--so-fg-muted)">
            {[0, 10, 20, 30, 40, 50, 60].map((s) => <text key={s} x={t(s * 1000)} y={H - 4} textAnchor="middle">T+{s}s</text>)}
          </g>
        </svg>
        <div className="font-data mt-2 flex justify-between text-[12px] text-fg-muted">
          <span>Shadow-follower simulation · 100 sampled scenarios · colour = scenario-adjusted outcome</span>
          <span>{f.competingCount} competing trades · {f.competingFlow} · source {fmtUsdWhole(end.state.sourceTrade!.sizeUsd)} BUY {f.token}</span>
        </div>
      </section>
    </main>
  );
}
