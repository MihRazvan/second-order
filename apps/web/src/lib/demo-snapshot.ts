/**
 * Deterministic frames of the demo scenario for design exploration and screenshot
 * baselines. Pure derivation from the fixture; no network.
 */
import {
  capacityCurve,
  crowdGuard,
  deriveInputs,
  evaluateShadowFollowers,
  initialScenarioState,
  reduceScenario,
  remainingAlpha,
  sampleShadowFollowers,
  DEFAULT_INTENT,
  DEFAULT_POLICY,
  type CapacityCurvePoint,
  type DerivedInputs,
  type ScenarioState,
  type ShadowOutcome,
  type Verdict,
} from '@second-order/core';
import { DEMO_REPLAY_ID, loadReplay } from '@second-order/replays';

export interface Frame {
  label: string;
  at: number;
  state: ScenarioState;
  derived: DerivedInputs;
  verdict: Verdict;
  remainingUsd: number;
  shadows: ShadowOutcome[];
  curve: CapacityCurvePoint[];
}

export const CURVE_DELAYS = [300, 500, 800, 1200, 2000, 3000, 5000, 8000, 12000, 20000, 30000, 45000];
export const SHADOWS = sampleShadowFollowers();

export function frameAt(state: ScenarioState, at: number, label: string, intent = DEFAULT_INTENT): Frame {
  const derived = deriveInputs(state, { nowAt: at })!;
  const verdict = crowdGuard(state, intent, DEFAULT_POLICY, at);
  return {
    label,
    at,
    state,
    derived,
    verdict,
    remainingUsd: remainingAlpha(derived, intent.delayMs).capacityUsd,
    shadows: evaluateShadowFollowers(derived, SHADOWS),
    curve: capacityCurve(derived, CURVE_DELAYS),
  };
}

export function demoFrames(): { armed: Frame; mid: Frame; end: Frame } {
  const file = loadReplay(DEMO_REPLAY_ID)!;
  let s = initialScenarioState();
  for (const e of file.events.filter((e) => e.at === 0)) s = reduceScenario(s, e);
  const armed = frameAt(s, 0, 'Armed');
  for (const e of file.events.filter((e) => e.at > 0 && e.at <= 24_000)) s = reduceScenario(s, e);
  const mid = frameAt(s, 24_000, 'Competing flow entering');
  for (const e of file.events.filter((e) => e.at > 24_000)) s = reduceScenario(s, e);
  const end = frameAt(s, file.manifest.durationMs, 'Crash test complete');
  return { armed, mid, end };
}

export interface TimelinePoint {
  at: number;
  remainingUsd: number;
  spotRatio: number;
  depthUsd: number | null;
  competingFlowUsd: number;
  competingFlowCount: number;
  sourceExited: boolean;
}

/** Per-second derived readings across the whole fixture, for time-based instruments. */
export function demoTimeline(stepMs = 1000, intent = DEFAULT_INTENT): TimelinePoint[] {
  const file = loadReplay(DEMO_REPLAY_ID)!;
  const events = [...file.events].sort((a, b) => a.at - b.at || a.seq - b.seq);
  let s = initialScenarioState();
  let i = 0;
  const out: TimelinePoint[] = [];
  for (let at = 0; at <= file.manifest.durationMs; at += stepMs) {
    while (i < events.length && events[i]!.at <= at) s = reduceScenario(s, events[i++]!);
    const d = deriveInputs(s, { nowAt: at });
    if (!d) continue;
    out.push({
      at,
      remainingUsd: remainingAlpha(d, intent.delayMs).capacityUsd,
      spotRatio: d.spotNow,
      depthUsd: d.impliedDepthUsd,
      competingFlowUsd: d.competingFlowUsd,
      competingFlowCount: d.competingFlowCount,
      sourceExited: d.quality.sourceExitWitnessed,
    });
  }
  return out;
}

/** Per-step derived readings from an arbitrary event list (snapshots, reports). */
export function timelineFromEvents(events: import('@second-order/contracts').DomainEvent[], durationMs: number, stepMs: number, intent = DEFAULT_INTENT): TimelinePoint[] {
  const sorted = [...events].sort((a, b) => a.at - b.at || a.seq - b.seq);
  let s = initialScenarioState();
  let i = 0;
  const out: TimelinePoint[] = [];
  for (let at = 0; at <= durationMs; at += stepMs) {
    while (i < sorted.length && sorted[i]!.at <= at) s = reduceScenario(s, sorted[i++]!);
    const d = deriveInputs(s, { nowAt: at });
    if (!d) continue;
    out.push({ at, remainingUsd: remainingAlpha(d, intent.delayMs).capacityUsd, spotRatio: d.spotNow, depthUsd: d.impliedDepthUsd, competingFlowUsd: d.competingFlowUsd, competingFlowCount: d.competingFlowCount, sourceExited: d.quality.sourceExitWitnessed });
  }
  return out;
}
