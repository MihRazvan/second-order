/**
 * Prints the three brief numbers as the reducer sees them. With `--search`, runs a
 * seeded random search over the physical parameters and prints the best config.
 */
import { crowdGuard, initialScenarioState, reduceScenario, DEFAULT_POLICY, DEFAULT_INTENT, deriveInputs, remainingAlpha, mulberry32 } from '@second-order/core';
import { generateDemo } from './generate';
import { DEMO_CONFIG, type DemoConfig } from './scenario-config';

const TARGET = { startCapacity: 14_200, userEvPct: -12.4, maxCompatible: 84 };

export function measure(cfg: DemoConfig) {
  const file = generateDemo(cfg);
  let s = initialScenarioState();
  for (const e of file.events.filter((e) => e.at === 0)) s = reduceScenario(s, e);
  const start = remainingAlpha(deriveInputs(s, { nowAt: 0 })!, DEFAULT_INTENT.delayMs, DEFAULT_POLICY);
  for (const e of file.events) s = reduceScenario(s, e);
  const d = deriveInputs(s, { nowAt: file.manifest.durationMs })!;
  const end = crowdGuard(s, DEFAULT_INTENT, DEFAULT_POLICY, file.manifest.durationMs);
  return {
    startCapacity: start.capacityUsd,
    startConfidence: start.confidence,
    userEvPct: +end.evPct.toFixed(2),
    maxCompatible: end.maxCompatibleUsd,
    decision: end.decision,
    confidence: end.confidence,
    context: { competingFlowUsd: d.competingFlowUsd, sourceExitUsd: s.sourceExits[0]?.sizeUsd, exitRatio: s.sourceExits[0]?.priceRatioVsEntry, impliedDepthUsd: d.impliedDepthUsd, spotRatio: d.spotRatio, events: file.events.length },
  };
}

function loss(m: ReturnType<typeof measure>) {
  const a = (m.startCapacity - TARGET.startCapacity) / TARGET.startCapacity;
  const b = (m.userEvPct - TARGET.userEvPct) / 5;
  const c = (m.maxCompatible - TARGET.maxCompatible) / 30;
  return a * a + b * b + c * c + (m.decision === 'RESIZE' ? 0 : 1);
}

if (process.argv.includes('--search')) {
  const rng = mulberry32(7);
  const iters = Number(process.argv[process.argv.indexOf('--search') + 1] ?? 400);
  let best: { cfg: DemoConfig; m: ReturnType<typeof measure>; l: number };
  try { const m0 = measure(DEMO_CONFIG); best = { cfg: DEMO_CONFIG, m: m0, l: loss(m0) }; }
  catch { best = { cfg: DEMO_CONFIG, m: null as never, l: Infinity }; }
  const jitter = (v: number, pct: number) => v * (1 + (rng() * 2 - 1) * pct);
  for (let i = 0; i < iters; i++) {
    const base = best.cfg;
    const fine = process.argv.includes('--fine');
    const scale = fine ? (i < iters / 2 ? 0.06 : 0.015) : i < iters / 3 ? 0.35 : i < (2 * iters) / 3 ? 0.12 : 0.04;
    const cfg: DemoConfig = {
      ...base,
      sourceSizeUsd: Math.round(Math.min(12_000, Math.max(3_000, jitter(base.sourceSizeUsd, scale))) / 100) * 100,
      quoteLiquidityUsd: Math.round(jitter(base.quoteLiquidityUsd, scale) / 1000) * 1000,
      depthDecay: +jitter(base.depthDecay, scale).toFixed(2),
      depthFloor: +Math.min(0.08, Math.max(0.015, jitter(base.depthFloor, scale))).toFixed(3),
      platformFeePct: +Math.min(1, Math.max(0.1, jitter(base.platformFeePct, scale))).toFixed(2),
      profile: { ...base.profile, typicalGainPct: Math.round(Math.min(90, Math.max(12, jitter(base.profile.typicalGainPct, scale)))) },
      flow: { ...base.flow, totalUsd: Math.round(jitter(base.flow.totalUsd, scale) / 500) * 500, burstShare: Math.min(0.9, Math.max(0.2, +jitter(base.flow.burstShare, scale * 0.5).toFixed(2))), burstUntilMs: Math.round(Math.min(30_000, Math.max(3_000, jitter(base.flow.burstUntilMs, scale))) / 500) * 500 },
      sourceExit: { atMs: Math.round(Math.min(40_000, Math.max(26_000, jitter(base.sourceExit.atMs, scale))) / 1000) * 1000, fraction: Math.min(0.85, Math.max(0.5, +jitter(base.sourceExit.fraction, scale * 0.5).toFixed(2))) },
    };
    let m: ReturnType<typeof measure>;
    try { m = measure(cfg); } catch { continue; }
    const l = loss(m);
    if (l < best.l) { best = { cfg, m, l }; console.error(`#${i} loss=${l.toFixed(4)}`, JSON.stringify({ start: m.startCapacity, ev: m.userEvPct, max: m.maxCompatible, d: m.decision }));
    }
  }
  console.log('CONFIG_JSON ' + JSON.stringify(best.cfg));
  console.log(JSON.stringify({ loss: best.l, measure: best.m, config: { sourceFeesUsd: best.cfg.sourceFeesUsd, depthFloor: best.cfg.depthFloor, sourceSizeUsd: best.cfg.sourceSizeUsd, quoteLiquidityUsd: best.cfg.quoteLiquidityUsd, depthDecay: best.cfg.depthDecay, typicalGainPct: best.cfg.profile.typicalGainPct, flowTotalUsd: best.cfg.flow.totalUsd, burstShare: best.cfg.flow.burstShare, burstUntilMs: best.cfg.flow.burstUntilMs, exitAtMs: best.cfg.sourceExit.atMs, exitFraction: best.cfg.sourceExit.fraction } }, null, 2));
} else {
  console.log(JSON.stringify({ target: TARGET, actual: measure(DEMO_CONFIG) }, null, 2));
}
