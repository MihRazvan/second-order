'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  capacityCurve,
  crowdGuard,
  deriveInputs,
  evaluateShadowFollowers,
  remainingAlpha,
  sampleShadowFollowers,
  type CapacityCurvePoint,
  type ModelInputs,
  solveCapacity,
} from '@second-order/core';
import { fmtUsdWhole } from '@/lib/format';
import type { TimelinePoint } from '@/lib/demo-snapshot';
import { useEventClock, useSession } from '@/lib/use-session';
import { useIntent } from '@/lib/use-intent';
import { Annunciator } from './annunciator';
import { Controls } from './controls';
import { EvidenceDrawer } from './evidence-drawer';
import { Readouts } from './readouts';
import { Recorder } from './recorder';
import { StatusBar } from './status-bar';

const SHADOWS = sampleShadowFollowers();
const CURVE_DELAYS = [300, 500, 800, 1200, 2000, 3000, 5000, 8000, 12000, 20000, 30000, 45000];

function useReducedMotion() {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setRm(mq.matches);
    const fn = (e: MediaQueryListEvent) => setRm(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return rm;
}

export function CrashTest() {
  const { snap, store } = useSession();
  const clock = useEventClock(snap, 12);
  const intentApi = useIntent();
  const reducedMotion = useReducedMotion();
  const { intent, policy, extraCrowdUsd } = intentApi;
  const durationMs = snap.manifest?.durationMs ?? 60_000;
  const nowAt = snap.phase === 'armed' || snap.phase === 'connecting' ? 0 : Math.min(clock, durationMs);
  const armed = snap.phase === 'armed' || snap.phase === 'connecting';

  const derived = useMemo(() => deriveInputs(snap.state, { nowAt, policy }), [snap.state, nowAt, policy]);
  const verdict = useMemo(() => (snap.state.sourceTrade ? crowdGuard(snap.state, intent, policy, nowAt) : null), [snap.state, intent, policy, nowAt]);
  const remainingUsd = useMemo(() => (derived ? remainingAlpha(derived, intent.delayMs, policy).capacityUsd : null), [derived, intent.delayMs, policy]);
  const shadows = useMemo(() => (derived ? evaluateShadowFollowers(derived, SHADOWS) : []), [derived]);
  const curve = useMemo<CapacityCurvePoint[]>(() => (derived ? capacityCurve(derived, CURVE_DELAYS, policy) : []), [derived, policy]);
  const crowdCurve = useMemo<CapacityCurvePoint[] | null>(() => {
    if (!derived || extraCrowdUsd <= 0) return null;
    const inputs: ModelInputs = { ...derived.inputs, aheadUsdAt: (d) => derived.inputs.aheadUsdAt(d) + extraCrowdUsd * Math.min(1, Math.sqrt(d / 30_000)) };
    return CURVE_DELAYS.map((d) => { const c = solveCapacity(inputs, d, { minSizeUsd: policy.minSizeUsd }); return { delayMs: d, capacityUsd: c.capacityUsd, confidence: c.confidence }; });
  }, [derived, extraCrowdUsd, policy]);

  // Start-of-test estimate, frozen when the run starts so the meter has a fixed "of" reference.
  const startAlphaRef = useRef<number | null>(null);
  if (armed && remainingUsd !== null) startAlphaRef.current = remainingUsd;
  const startAlphaUsd = startAlphaRef.current ?? remainingUsd ?? 0;

  // Timeline accumulates one reading per second as the replay advances.
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const lastSecRef = useRef(-1);
  useEffect(() => {
    if (armed) { if (timeline.length) setTimeline([]); lastSecRef.current = -1; return; }
    if (!derived) return;
    const sec = Math.floor(nowAt / 1000);
    if (sec <= lastSecRef.current) return;
    lastSecRef.current = sec;
    setTimeline((tl) => [...tl, {
      at: sec * 1000,
      remainingUsd: remainingUsd ?? 0,
      spotRatio: derived.spotNow,
      depthUsd: derived.impliedDepthUsd,
      competingFlowUsd: derived.competingFlowUsd,
      competingFlowCount: derived.competingFlowCount,
      sourceExited: derived.quality.sourceExitWitnessed,
    }]);
  }, [armed, derived, nowAt, remainingUsd, timeline.length]);

  const wallet = snap.state.sourceTrade?.wallet ?? null;
  const blocked = !!wallet && intentApi.blocked.includes(wallet);
  const followersEntered = shadows.filter((s) => s.delayMs <= nowAt).length;
  const finalVerdict = snap.phase === 'ended' ? verdict : null;

  return (
    <main className="min-h-screen bg-bg text-fg">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line px-6 py-3 md:px-8">
        <div className="flex items-baseline gap-5">
          <span className="text-[15px] font-semibold tracking-tight">Second Order</span>
          <span className="text-[14px] text-fg-muted">Alpha Crash Test</span>
        </div>
        <StatusBar
          provenance={snap.manifest?.provenance.kind ?? null}
          transport={snap.transport}
          connection={snap.connection}
          phase={snap.phase}
          speed={snap.speed}
          nowAt={nowAt}
          degraded={!!derived?.quality.degraded && !armed}
        />
      </header>

      <section className="grid gap-px border-b border-line bg-line md:grid-cols-[1fr_1fr_1fr_minmax(360px,1.25fr)]">
        <Readouts state={snap.state} remainingUsd={remainingUsd} startAlphaUsd={startAlphaUsd} verdict={armed ? null : verdict} intent={intent} phase={snap.phase} />
        <div className="bg-bg">
          <Annunciator
            phase={snap.phase}
            verdict={snap.phase === 'running' ? verdict : finalVerdict}
            intent={intent}
            wallet={wallet}
            blocked={blocked}
            progress={durationMs ? nowAt / durationMs : 0}
            followersEntered={followersEntered}
            competingFlowUsd={derived?.competingFlowUsd ?? 0}
            error={snap.error}
            onStart={() => void store.start()}
            onResize={(usd) => intentApi.setSize(usd)}
            onBlock={() => wallet && intentApi.block(wallet)}
            onUnblock={() => wallet && intentApi.unblock(wallet)}
            onReset={() => void store.reset()}
            reducedMotion={reducedMotion}
          />
        </div>
      </section>

      <section className="px-6 pt-4 md:px-8">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <Recorder
              state={snap.state}
              derived={derived}
              shadows={shadows}
              timeline={timeline}
              nowAt={nowAt}
              durationMs={durationMs}
              startAlphaUsd={startAlphaUsd}
              remainingUsd={remainingUsd}
              intent={intent}
              phase={snap.phase}
              reducedMotion={reducedMotion}
            />
          </div>
        </div>
        <div className="font-data mt-1 flex flex-wrap justify-between gap-x-6 gap-y-1 text-[12px] text-fg-faint">
          <span>Shadow-follower simulation · 100 sampled scenarios · colour = scenario-adjusted outcome (green ≥ +2%, amber ±2%, red ≤ −2%)</span>
          <span>{derived ? `${derived.competingFlowCount} competing trades · ${fmtUsdWhole(derived.competingFlowUsd)}` : ''}{snap.manifest ? ` · ${snap.manifest.eventCount} events` : ''}</span>
        </div>
      </section>

      <section className="border-t border-line px-6 py-5 md:px-8">
        <Controls
          intent={intent}
          extraCrowdUsd={extraCrowdUsd}
          onSize={intentApi.setSize}
          onDelay={intentApi.setDelay}
          onExtraCrowd={intentApi.setExtraCrowd}
          curve={curve}
          crowdCurve={crowdCurve}
          maxCompatibleUsd={verdict?.maxCompatibleUsd ?? null}
        />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-6 py-5 md:px-8">
        <div className="max-w-[70ch] text-[13px] leading-[1.5] text-fg-muted">
          CrowdGuard compares your intended size and delay against the capacity surface derived in this browser from the same normalized events the stream service saw. {snap.manifest ? `${snap.manifest.disclosure}` : ''}
          {remainingUsd !== null && !armed && <> Remaining Alpha now {fmtUsdWhole(remainingUsd)}.</>}
        </div>
        <EvidenceDrawer state={snap.state} derived={derived} verdict={verdict} manifest={snap.manifest} intent={intent} nowAt={nowAt} />
      </section>
    </main>
  );
}
