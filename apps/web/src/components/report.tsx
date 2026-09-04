'use client';
import { useEffect, useMemo, useState } from 'react';
import { PROVENANCE_LABEL, SessionSnapshot as SessionSnapshotSchema, type SessionSnapshot } from '@second-order/contracts';
import { capacityCurve, crowdGuard, deriveInputs, evaluateShadowFollowers, initialScenarioState, reduceScenario, remainingAlpha, sampleShadowFollowers, DEFAULT_INTENT, DEFAULT_POLICY, type ScenarioState } from '@second-order/core';
import { fmtDelay, fmtPct, fmtUsdWhole, shortAddress } from '@/lib/format';
import { STREAM_URL } from '@/lib/use-session';
import { Bracket, KeyLegend, Panel, toneClass, toneForEv, toneForLevel, type Tone } from '@/bios/primitives';
import { AlphaMeter, CapacityMap, FlowAndDepth, FollowerGrid } from '@/bios/recorder-bios';

const GRID_COLS = 20;
const SHADOWS = sampleShadowFollowers({ cols: GRID_COLS });
const CURVE_DELAYS = [300, 500, 800, 1200, 2000, 3000, 5000, 8000, 12000, 20000, 30000, 45000];
const COL_LABELS = ['.3s', '', '.5s', '', '1s', '', '2s', '', '3s', '', '5s', '', '9s', '', '15s', '', '27s', '', '45s', ''];

function readHash(): { sizeUsd: number; delayMs: number } {
  if (typeof window === 'undefined') return DEFAULT_INTENT;
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const sizeUsd = Number(h.get('size'));
  const delayMs = Number(h.get('delay'));
  return { sizeUsd: sizeUsd > 0 ? sizeUsd : DEFAULT_INTENT.sizeUsd, delayMs: delayMs > 0 ? delayMs : DEFAULT_INTENT.delayMs };
}

function Row({ k, v, tone = 'white' }: { k: string; v: React.ReactNode; tone?: Tone }) {
  return (
    <div className="grid grid-cols-[minmax(160px,1fr)_minmax(0,1.6fr)] items-baseline gap-4 px-3 py-[3px]"><span className="bios-label">{k}</span><span className={toneClass[tone]}>{v}</span></div>
  );
}

/** A static printout of one completed crash test. Intent comes from the URL fragment only. */
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
      .then(async (r) => { if (!r.ok) throw new Error(r.status === 404 ? 'Session not known to the stream service (evicted or never persisted).' : `Stream ${r.status}`); return SessionSnapshotSchema.parse(await r.json()); })
      .then((s) => { if (!cancelled) setSnap(s); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [sessionId]);

  const c = useMemo(() => {
    if (!snap) return null;
    const events = [...snap.events].sort((a, b) => a.at - b.at || a.seq - b.seq);
    let state: ScenarioState = initialScenarioState();
    for (const e of events) state = reduceScenario(state, e);
    const endAt = state.lastEventAt;
    const derived = deriveInputs(state, { nowAt: endAt });
    if (!derived) return null;
    let armed = initialScenarioState();
    for (const e of events.filter((e) => e.at === 0)) armed = reduceScenario(armed, e);
    const ad = deriveInputs(armed, { nowAt: 0 });
    return {
      state, derived, endAt,
      verdict: crowdGuard(state, intent, DEFAULT_POLICY, endAt),
      startAlphaUsd: ad ? remainingAlpha(ad, intent.delayMs).capacityUsd : 0,
      remainingUsd: remainingAlpha(derived, intent.delayMs).capacityUsd,
      shadows: evaluateShadowFollowers(derived, SHADOWS),
      curve: capacityCurve(derived, CURVE_DELAYS),
    };
  }, [snap, intent]);

  const copy = async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } };

  if (error) return <main className="min-h-screen bg-desk p-3"><div className="bios-box bg-bios p-6"><h1 className="bios-title">REPORT UNAVAILABLE</h1><p className="mt-2 max-w-[60ch]">{error}</p><a className="mt-4 inline-block text-bios-cyan underline" href="/">Back to the utility</a></div></main>;
  if (!snap || !c) return <main className="min-h-screen bg-desk p-3"><div className="bios-box bg-bios p-6 text-bios-fg">LOADING REPORT<span className="bios-caret" /></div></main>;

  const { state, derived, verdict, endAt, startAlphaUsd, remainingUsd, shadows, curve } = c;
  const trade = state.sourceTrade;
  const kind = snap.session.provenanceKind;
  const provTone: Tone = kind === 'live-witnessed' ? 'green' : kind === 'estimated-reconstruction' ? 'cyan' : 'yellow';
  const security = verdict.decision === 'BLOCK' && verdict.reasons.some((r) => r.startsWith('Critical security flag'));
  const title = verdict.decision === 'ALLOW' ? 'SCENARIO-COMPATIBLE' : verdict.decision === 'RESIZE' ? 'CROWD CAPTURE RISK' : security ? 'SECURITY BLOCK' : 'CAPACITY EXHAUSTED';
  const vTone: Tone = verdict.decision === 'ALLOW' ? 'green' : 'red';

  return (
    <main className="min-h-screen bg-desk p-2 text-[16px] sm:p-3 sm:text-[19px] lg:text-[22px] print:bg-white">
      <div className="bios-box mx-auto flex min-h-[calc(100vh-16px)] max-w-[1440px] flex-col bg-bios">
        <header className="px-3 pb-2 pt-3 text-center">
          <h1 className="bios-title text-[1.35em] leading-none">SECOND ORDER · CRASH TEST REPORT</h1>
          <p className="mt-1 text-bios-fg">SESSION {sessionId.slice(0, 8)} · {new Date(snap.session.startedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC · <span className={toneClass[provTone]}>{PROVENANCE_LABEL[kind].toUpperCase()}</span></p>
        </header>
        <div className="grid gap-2 px-2 md:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <Panel>
            <div className="py-2">
              <Row k="SOURCE WALLET" v={<Bracket>{trade ? shortAddress(trade.wallet) : '—'}</Bracket>} />
              <Row k="SOURCE TRADE" v={<Bracket>{trade ? `${trade.side.toUpperCase()} ${trade.token.symbol} ${fmtUsdWhole(trade.sizeUsd)}` : '—'}</Bracket>} />
              <Row k="INTENDED SIZE" v={<Bracket>{fmtUsdWhole(intent.sizeUsd)}</Bracket>} />
              <Row k="FOLLOWER DELAY" v={<Bracket>{fmtDelay(intent.delayMs).toUpperCase()}</Bracket>} />
              <div className="bios-rule mx-3 my-2" />
              <Row k="SOURCE RETURN" v={state.profile ? `${fmtPct(state.profile.realizedRatePct, Math.abs(state.profile.realizedRatePct) < 10 ? 1 : 0)} · ${state.profile.periodDays}D` : '—'} tone="green" />
              <Row k="REMAINING ALPHA" v={`${fmtUsdWhole(remainingUsd)} OF ${fmtUsdWhole(startAlphaUsd)}`} tone={toneForLevel(remainingUsd, startAlphaUsd)} />
              <Row k="FOLLOWER RETURN" v={fmtPct(verdict.evPct, 1)} tone={toneForEv(verdict.evPct)} />
              <Row k="CROWDGUARD VERDICT" v={<span data-decision={verdict.decision}>** {verdict.decision} ** {title}</span>} tone={vTone} />
              <Row k="MAX COMPATIBLE" v={verdict.maxCompatibleUsd > 0 ? fmtUsdWhole(verdict.maxCompatibleUsd) : 'NONE'} tone={verdict.maxCompatibleUsd > 0 ? 'white' : 'red'} />
            </div>
          </Panel>
          <Panel>
            <div className="px-4 py-2">
              <h3 className="bios-title text-center leading-none">What the verdict rests on</h3>
              <div className="bios-rule mt-2" />
              <ul className="mt-3 space-y-2 text-bios-fg">
                <li>{derived.competingFlowCount} same-direction trades worth {fmtUsdWhole(derived.competingFlowUsd)} entered after the source in the window.</li>
                <li>Execution depth implied by the latest quotes: {derived.impliedDepthUsd ? fmtUsdWhole(derived.impliedDepthUsd) : 'unmeasured'}; reported pool depth {fmtUsdWhole((state.market?.liquidityUsd ?? 0) / 2)}.</li>
                <li>Source exit {derived.quality.sourceExitWitnessed ? `observed at ${fmtDelay(state.sourceExits[0]!.delayMs)} (${Math.round(state.sourceExits[0]!.fractionOfPosition * 100)}% of position)` : 'not observed in the window; full exit at the typical target assumed'}.</li>
                {verdict.reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}
              </ul>
              <p className="mt-3 text-bios-dim">{kind === 'demo-scenario' ? 'Demo scenario: synthetic events, nothing captured from a market.' : kind === 'estimated-reconstruction' ? 'Estimated reconstruction from Mobula history; quotes inferred from the price path and current depth.' : 'Live witnessed: captured from Mobula while it happened.'} Shadow followers are sampled scenarios, not wallets. Estimates, not guarantees.</p>
            </div>
          </Panel>
        </div>
        <div className="px-2 pt-2">
          <Panel title="CRASH TEST RECORDER" right={<span>T+{(endAt / 1000).toFixed(1)}S · {state.seen.size} EVENTS</span>}>
            <div className="overflow-x-auto px-3 pb-2 pt-1">
              <div className="min-w-[72ch] space-y-1">
                <AlphaMeter remainingUsd={remainingUsd} startUsd={startAlphaUsd} delayMs={intent.delayMs} />
                <FlowAndDepth derived={derived} state={state} />
                <div className="bios-rule my-1" />
                <div className="grid gap-x-8 gap-y-2 xl:grid-cols-2">
                  <FollowerGrid shadows={shadows} nowAt={endAt} intent={intent} cols={GRID_COLS} colLabels={COL_LABELS} />
                  <CapacityMap curve={curve} intent={intent} maxCompatibleUsd={verdict.maxCompatibleUsd} />
                </div>
              </div>
            </div>
          </Panel>
        </div>
        <footer className="mt-auto px-2 pb-2 pt-2 print:hidden">
          <div className="bios-box">
            <KeyLegend keys={[
              { key: 'F1', label: 'Back to utility', onClick: () => window.location.assign('/') },
              { key: 'F7', label: copied ? 'Link copied' : 'Copy link', onClick: () => void copy() },
              { key: 'F12', label: 'Print / PDF', onClick: () => window.print() },
            ]} />
          </div>
        </footer>
      </div>
    </main>
  );
}
