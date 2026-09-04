import { demoFrames } from '@/lib/demo-snapshot';
import { delayScale, sizeScale } from '@/viz/scales';
import { LogGrid, SwarmMarks } from '@/viz/swarm';
import { facts } from '../_shared';

/**
 * Direction C — Forensic editorial analysis.
 * A typographic thesis, numbered evidence, one annotated data graphic and a verdict
 * band. Reads like a data-journalism investigation of a single trade.
 */
export default function DirectionC() {
  const frames = demoFrames();
  const f = facts(frames);
  const end = frames.end;
  const W = 620, H = 440, m = { l: 56, r: 16, t: 16, b: 40 };
  const x = delayScale([m.l, W - m.r]);
  const y = sizeScale([H - m.b, m.t]);
  const boundary = end.curve.filter((p) => p.capacityUsd > 0).map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.delayMs).toFixed(1)},${y(Math.max(50, Math.min(5000, p.capacityUsd))).toFixed(1)}`).join(' ');

  return (
    <main className="min-h-screen bg-bg text-fg" style={{ fontFamily: 'var(--font-ui)' }}>
      <header className="flex items-baseline justify-between px-12 pt-6">
        <span className="text-[15px] font-semibold tracking-tight">Second Order</span>
        <span className="font-data text-[12px] text-fg-muted">{f.provenance} · Alpha Crash Test · {f.walletShort}</span>
      </header>

      <section className="grid grid-cols-[1fr_620px] gap-12 px-12 pt-10">
        <div>
          <h1 className="text-[52px] font-medium leading-[1.02] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
            This wallet made <span className="text-alpha">{f.roi}</span> in {f.periodDays} days. Copying its latest trade with $1,000, five seconds late, returns an estimated <span className="text-red">{f.userEv}</span>.
          </h1>
          <p className="mt-6 max-w-[58ch] text-[17px] leading-[1.5] text-fg-muted">
            The source bought {f.sourceSize} of {f.token} on {f.chain}. Within a minute, {f.competingCount} same-direction trades worth {f.competingFlow} entered the same route, observed execution depth fell from {f.depthStart} to {f.depthEnd}, and the source sold {f.exitFraction}% of its position at {f.exitAtS} seconds. A follower entering at five seconds has {f.endAlpha} of scenario-compatible room left, down from {f.startAlpha}.
          </p>
          <ol className="mt-8 grid gap-4 text-[14px]">
            <li className="grid grid-cols-[48px_1fr] border-t border-line pt-3"><span className="font-data text-fg-faint">01</span><span><span className="text-fg">Competing flow.</span> <span className="text-fg-muted">{f.competingFlow} entered behind the source. Same-direction trades; whether they are copies is not something the data can show.</span></span></li>
            <li className="grid grid-cols-[48px_1fr] border-t border-line pt-3"><span className="font-data text-fg-faint">02</span><span><span className="text-fg">Execution deteriorated.</span> <span className="text-fg-muted">Quotes for the same size moved from near the source price to well above it while depth thinned to {f.depthEnd}.</span></span></li>
            <li className="grid grid-cols-[48px_1fr] border-t border-b border-line py-3"><span className="font-data text-fg-faint">03</span><span><span className="text-fg">Source-exit overlap.</span> <span className="text-fg-muted">The source sold {f.exitFraction}% at {f.exitRatio} versus its entry. Followers still holding exit into what it left behind. This describes timing, not intent.</span></span></li>
          </ol>
        </div>

        <figure>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Annotated shadow-follower simulation by delay and size">
            <LogGrid x={x} y={y} delays={[1000, 5000, 20000]} sizes={[100, 1000]} x0={m.l} x1={W - m.r} y0={m.t} y1={H - m.b} />
            <path d={boundary} fill="none" stroke="var(--so-alpha)" strokeWidth={1.5} />
            <SwarmMarks shadows={end.shadows} x={x} y={y} r={4} />
            <circle cx={x(5000)} cy={y(1000)} r={10} fill="none" stroke="var(--so-fg)" strokeWidth={1.5} />
            <line x1={x(5000) + 10} y1={y(1000)} x2={x(5000) + 70} y2={y(1000) - 40} stroke="var(--so-fg)" strokeWidth={1} />
            <text x={x(5000) + 74} y={y(1000) - 44} fontSize={12} fill="var(--so-fg)" fontFamily="var(--font-ui)">Your copy: $1,000 at 5 s, {f.userEv}</text>
            <text x={x(400)} y={y(3600)} fontSize={12} fill="var(--so-alpha)" fontFamily="var(--font-ui)">Scenario-positive region lies below the green boundary</text>
            <g fontFamily="var(--font-data)" fontSize={11} fill="var(--so-fg-muted)">
              {[1000, 5000, 20000].map((d) => <text key={d} x={x(d)} y={H - 16} textAnchor="middle">{d / 1000} s</text>)}
              {[100, 1000].map((s) => <text key={s} x={m.l - 8} y={y(s) + 4} textAnchor="end">${s}</text>)}
              <text x={W - m.r} y={H - 2} textAnchor="end">delay behind source →</text>
              <text x={m.l} y={10}>size ↑</text>
            </g>
          </svg>
          <figcaption className="mt-2 text-[12px] leading-[1.5] text-fg-muted">
            Figure 1. Shadow-follower simulation: 100 sampled (delay, size) scenarios evaluated against observed quotes. Green ≥ +2%, amber within ±2%, red ≤ −2% scenario-adjusted outcome. {f.provenance}; not a record of real followers.
          </figcaption>
        </figure>
      </section>

      <section className="mx-12 mt-8 grid grid-cols-[auto_1fr_auto] items-center gap-8 border-t-2 border-red py-5">
        <div>
          <div className="text-red text-[13px] font-semibold tracking-wide">CROWD CAPTURE RISK</div>
          <div className="mt-1 text-[14px] text-fg-muted">CrowdGuard verdict for your intended copy</div>
        </div>
        <div className="font-data flex gap-10 text-[14px]">
          <div><div className="text-fg-muted text-[12px]">$1,000 scenario outcome</div><div className="text-red text-[26px] leading-none">{f.userEv}</div></div>
          <div><div className="text-fg-muted text-[12px]">Maximum scenario-compatible size</div><div className="text-[26px] leading-none">{f.maxCompatible}</div></div>
          <div><div className="text-fg-muted text-[12px]">Remaining Alpha at 5 s</div><div className="text-[26px] leading-none">{f.endAlpha} <span className="text-fg-faint text-[13px]">of {f.startAlpha}</span></div></div>
        </div>
        <div className="flex gap-2">
          <button className="bg-fg px-4 py-2 text-[13px] font-medium text-bg-sunken" type="button">Resize to {f.maxCompatible}</button>
          <button className="border border-line-strong px-4 py-2 text-[13px]" type="button">Block wallet</button>
        </div>
      </section>
    </main>
  );
}
