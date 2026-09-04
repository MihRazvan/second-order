/** Debug helper: fetch a session snapshot from a stream service and print the model view for a size/delay. Usage: tsx src/debug-session.ts <streamUrl> <sessionId> [sizeUsd] [delayMs] */
import { crowdGuard, deriveInputs, followerOutcome, initialScenarioState, reduceScenario, DEFAULT_POLICY } from '@second-order/core';
import { SessionSnapshot } from '@second-order/contracts';

const [url, id, sizeArg, delayArg] = process.argv.slice(2);
const snap = SessionSnapshot.parse(await (await fetch(`${url}/api/sessions/${id}/snapshot`)).json());
let s = initialScenarioState();
for (const e of [...snap.events].sort((a, b) => a.at - b.at || a.seq - b.seq)) s = reduceScenario(s, e);
const nowAt = s.lastEventAt;
const d = deriveInputs(s, { nowAt })!;
const intent = { sizeUsd: Number(sizeArg ?? 1000), delayMs: Number(delayArg ?? 5000) };
console.log('inputs', { targetRatio: d.inputs.targetRatio, sourceExitUsd: d.inputs.sourceExitUsd, exitLiquidityUsd: d.inputs.exitLiquidityUsd, platformFeePct: d.inputs.platformFeePct, fixedFeesUsd: d.inputs.fixedFeesUsd, buyTax: d.inputs.buyTaxPct, sellTax: d.inputs.sellTaxPct, spotNow: d.spotNow, impliedDepth: d.impliedDepthUsd, quotes: d.quality.observedQuotes, issues: d.quality.issues });
for (const size of [50, 100, 250, 500, 1000, 2000]) {
  const o = followerOutcome(d.inputs, intent.delayMs, size);
  console.log(size, { ev: +o.evPct.toFixed(2), entry: +o.entryRatio.toFixed(4), exit: +o.exitRatio.toFixed(4), conf: o.confidence, b: Object.fromEntries(Object.entries(o.breakdown).map(([k, v]) => [k, +v.toFixed(2)])) });
}
console.log('grid ratios @5s', [50, 100, 500, 1000, 5000, 20000].map((x) => [x, +d.inputs.grid.ratio(intent.delayMs, x).value.toFixed(4), d.inputs.grid.ratio(intent.delayMs, x).confidence]));
console.log('verdict', crowdGuard(s, intent, DEFAULT_POLICY, nowAt).decision);
