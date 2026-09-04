'use client';
import { useEffect, useMemo, useState } from 'react';
import { PROVENANCE_LABEL, SessionSnapshot as SessionSnapshotSchema, type SessionSnapshot } from '@second-order/contracts';
import { crowdGuard, deriveInputs, evaluateShadowFollowers, initialScenarioState, reduceScenario, remainingAlpha, sampleShadowFollowers, DEFAULT_INTENT, DEFAULT_POLICY, type ScenarioState } from '@second-order/core';
import { fmtDelay, fmtPct, fmtUsdWhole, shortAddress } from '@/lib/format';
import { timelineFromEvents } from '@/lib/demo-snapshot';
import { STREAM_URL } from '@/lib/use-session';
import { Recorder } from './recorder';

const SHADOWS = sampleShadowFollowers();

function readHash(): { sizeUsd: number; delayMs: number } {
  if (typeof window === 'undefined') return DEFAULT_INTENT;
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const sizeUsd = Number(h.get('size'));
  const delayMs = Number(h.get('delay'));
  return { sizeUsd: sizeUsd > 0 ? sizeUsd : DEFAULT_INTENT.sizeUsd, delayMs: delayMs > 0 ? delayMs : DEFAULT_INTENT.delayMs };
}

/**
 * A static, shareable rendering of one completed crash test. Everything is recomputed
 * from the session's events; the reader's intent lives in the URL fragment only.
 */
export function Report({ sessionId }: { sessionId: string }) {
  const [snap, setSnap] = useState<SessionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState(DEFAULT_INTENT);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIntent(readHash());
    const onHash = () => setIntent(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${STREAM_URL}/api/sessions/${sessionId}/snapshot`)
      .then(async (r) => { if (!r.ok) throw new Error(r.status === 404 ? 'This session is not known to the stream service (it may have been evicted or never persisted).' : `Stream ${r.status}`); return SessionSnapshotSchema.parse(await r.json()); })
      .then((s) => { if (!cancelled) setSnap(s); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [sessionId]);

  const computed = useMemo(() => {
    if (!snap) return null;
    const events = [...snap.events].sort((a, b) => a.at - b.at || a.seq - b.seq);
    let state: ScenarioState = initialScenarioState();
    for (const e of events) state = reduceScenario(state, e);
    const endAt = state.lastEventAt;
    const derived = deriveInputs(state, { nowAt: endAt });
    if (!derived) return null;
    const verdict = crowdGuard(state, intent, DEFAULT_POLICY, endAt);
    let armed = initialScenarioState();
    for (const e of events.filter((e) => e.at === 0)) armed = reduceScenario(armed, e);
    const armedDerived = deriveInputs(armed, { nowAt: 0 });
    const startAlphaUsd = armedDerived ? remainingAlpha(armedDerived, intent.delayMs).capacityUsd : 0;
    const step = Math.max(1000, Math.round(endAt / 120 / 1000) * 1000);
    return { state, derived, verdict, endAt, startAlphaUsd, remainingUsd: remainingAlpha(derived, intent.delayMs).capacityUsd, shadows: evaluateShadowFollowers(derived, SHADOWS), timeline: timelineFromEvents(events, endAt, step, intent) };
  }, [snap, intent]);

  if (error) {
    return <main className="min-h-screen bg-bg p-8 text-fg"><h1 className="text-[18px] font-medium">Report unavailable</h1><p className="mt-2 max-w-[60ch] text-[14px] text-fg-muted">{error}</p></main>;
  }
  if (!snap || !computed) return <main className="min-h-screen bg-bg p-8 text-fg-muted">Loading report…</main>;

  const { state, derived, verdict, endAt, startAlphaUsd, remainingUsd, shadows, timeline } = computed;
  const trade = state.sourceTrade;
  const kind = snap.session.provenanceKind;
  const tone = verdict.decision === 'ALLOW' ? 'text-alpha' : 'text-red';
  const securityBlock = verdict.decision === 'BLOCK' && verdict.reasons.some((r) => r.startsWith('Critical security flag'));
  const title = verdict.decision === 'ALLOW' ? 'SCENARIO-COMPATIBLE' : verdict.decision === 'RESIZE' ? 'CROWD CAPTURE RISK' : securityBlock ? 'SECURITY BLOCK' : 'CAPACITY EXHAUSTED';

  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <main className="min-h-screen bg-bg text-fg">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line px-6 py-3 md:px-8 print:border-black">
        <div className="flex items-baseline gap-5">
          <a href="/" className="text-[15px] font-semibold tracking-tight hover:underline">Second Order</a>
          <span className="text-[14px] text-fg-muted">Crash test report</span>
        </div>
        <div className="font-data flex flex-wrap items-center gap-x-5 text-[12px] text-fg-muted">
          <span className={kind === 'live-witnessed' ? 'text-alpha' : kind === 'estimated-reconstruction' ? 'text-evidence' : 'text-amber'}>{PROVENANCE_LABEL[kind]}</span>
          <span>session {sessionId.slice(0, 8)}</span>
          <span>{new Date(snap.session.startedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC</span>
          <button type="button" onClick={copy} className="border border-line-strong px-2.5 py-1 text-[12px] text-fg hover:border-fg print:hidden">{copied ? 'Link copied' : 'Copy link'}</button>
          <button type="button" onClick={() => window.print()} className="border border-line-strong px-2.5 py-1 text-[12px] text-fg hover:border-fg print:hidden">Print / PDF</button>
        </div>
      </header>

      <section className="grid gap-px border-b border-line bg-line md:grid-cols-4">
        <div className="bg-bg px-6 py-4 md:px-8">
          <div className="text-[12px] text-fg-muted">Tracked wallet · {trade ? shortAddress(trade.wallet) : '—'}</div>
          <div className="font-data mt-1 text-[32px] leading-none text-alpha">{state.profile ? fmtPct(state.profile.realizedRatePct, 0) : '—'}</div>
          <div className="mt-1.5 text-[12px] text-fg-muted">{state.profile ? `realized over ${state.profile.periodDays} days` : 'no profile'}{trade ? ` · ${trade.side.toUpperCase()} ${trade.token.symbol} ${fmtUsdWhole(trade.sizeUsd)}` : ''}</div>
        </div>
        <div className="bg-bg px-6 py-4 md:px-8">
          <div className="text-[12px] text-fg-muted">Remaining Alpha at {fmtDelay(intent.delayMs)}</div>
          <div className={`font-data mt-1 text-[32px] leading-none ${remainingUsd > startAlphaUsd * 0.5 ? 'text-alpha' : remainingUsd > startAlphaUsd * 0.1 ? 'text-amber' : 'text-red'}`}>{fmtUsdWhole(remainingUsd)}</div>
          <div className="mt-1.5 text-[12px] text-fg-muted">of {fmtUsdWhole(startAlphaUsd)} estimated at the source trade</div>
        </div>
        <div className="bg-bg px-6 py-4 md:px-8">
          <div className="text-[12px] text-fg-muted">A {fmtUsdWhole(intent.sizeUsd)} copy at {fmtDelay(intent.delayMs)}</div>
          <div className={`font-data mt-1 text-[32px] leading-none ${tone}`}>{fmtPct(verdict.evPct, 1)}</div>
          <div className="mt-1.5 text-[12px] text-fg-muted">scenario-adjusted outcome · size and delay come from this link's fragment</div>
        </div>
        <div className={`border-t-2 bg-bg-raised px-6 py-4 md:px-7 ${verdict.decision === 'ALLOW' ? 'border-alpha' : 'border-red'}`} data-decision={verdict.decision}>
          <div className={`text-[13px] font-semibold tracking-[0.04em] ${tone}`}>{title}</div>
          <div className="mt-1 text-[12px] text-fg-muted">Max scenario-compatible size</div>
          <div className="font-data text-[26px] leading-none">{verdict.maxCompatibleUsd > 0 ? fmtUsdWhole(verdict.maxCompatibleUsd) : 'none'}</div>
          <div className="mt-1 text-[11px] text-fg-faint">{verdict.confidence} · {derived.quality.degraded ? 'data incomplete' : 'data complete'}</div>
        </div>
      </section>

      <section className="px-6 pt-4 md:px-8">
        <div className="overflow-x-auto"><div className="min-w-[760px]">
          <Recorder state={state} derived={derived} shadows={shadows} timeline={timeline} nowAt={endAt} durationMs={Math.max(endAt, 1000)} startAlphaUsd={startAlphaUsd} remainingUsd={remainingUsd} intent={intent} phase="ended" reducedMotion />
        </div></div>
      </section>

      <section className="grid gap-8 border-t border-line px-6 py-6 md:grid-cols-2 md:px-8">
        <div>
          <h2 className="text-[14px] font-medium">What the verdict rests on</h2>
          <ul className="mt-2 grid gap-1 text-[13px] text-fg-muted">
            <li>{derived.competingFlowCount} same-direction trades worth {fmtUsdWhole(derived.competingFlowUsd)} entered after the source in the window.</li>
            <li>Execution depth implied by the latest quotes: {derived.impliedDepthUsd ? fmtUsdWhole(derived.impliedDepthUsd) : 'unmeasured'}; reported pool depth {fmtUsdWhole((state.market?.liquidityUsd ?? 0) / 2)}.</li>
            <li>Source exit {derived.quality.sourceExitWitnessed ? `observed at ${fmtDelay(state.sourceExits[0]!.delayMs)} (${Math.round(state.sourceExits[0]!.fractionOfPosition * 100)}% of position)` : 'not observed in the window; full exit at the typical target assumed'}.</li>
            <li>Exit target ratio {derived.inputs.targetRatio.toFixed(3)} · spot now {derived.spotNow.toFixed(3)} vs source execution.</li>
            {verdict.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
        <div>
          <h2 className="text-[14px] font-medium">Provenance</h2>
          <p className="mt-2 text-[13px] leading-[1.5] text-fg-muted">
            {kind === 'demo-scenario' && 'Demo scenario: every event is synthetic. Nothing here was captured from a live market.'}
            {kind === 'estimated-reconstruction' && 'Estimated reconstruction: trades, prices and context were fetched from Mobula history after the fact. Quotes are inferred from the price path and current pool depth, not observed.'}
            {kind === 'live-witnessed' && 'Live witnessed: observations were captured from Mobula endpoints while they happened. Estimates remain estimates.'}
            {state.status?.message ? ` ${state.status.message}` : ''}
          </p>
          <p className="mt-3 text-[12px] leading-[1.5] text-fg-faint">Shadow followers are sampled scenarios, not real wallets. Same-direction trades do not prove copy-trading. A source exit overlapping follower exits describes timing, not intent. Scenario outcomes are estimates, not guarantees.</p>
        </div>
      </section>
    </main>
  );
}
