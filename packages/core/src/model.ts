import { cpSellRatio, followerEntryRatio, worstConfidence, type Confidence, type Estimate, type QuoteGrid } from './grid';

/**
 * Inputs to the follower outcome model. Everything here is an observation or an
 * explicitly labelled assumption; nothing is user-specific.
 */
export interface ModelInputs {
  grid: QuoteGrid;
  /**
   * Same-direction flow (USD) ahead of the follower at delay d that the quote grid does
   * NOT already reflect. Observed quotes already contain realized flow, so this is 0 for
   * observed columns; it carries hypothetical crowd for the capacity surface and realized
   * flow for the model-only fallback.
   */
  aheadUsdAt(delayMs: number): number;
  /**
   * Exit price ratio vs source entry the follower can exit at. Before a source exit is
   * witnessed this is the source's typical gain (the thesis is alive); after it is the
   * current observed spot (no further upside is assumed once the source has left).
   */
  targetRatio: number;
  /** USD the source is still expected to sell before the follower exits (unwitnessed remainder of its position). */
  sourceExitUsd: number;
  /** Quote-side liquidity at exit (USD). */
  exitLiquidityUsd: number;
  buyTaxPct: number;
  sellTaxPct: number;
  /** Fixed per-order cost (gas + platform), USD. */
  fixedFeesUsd: number;
  /** Confidence of the exit-side assumptions (observed source exit vs assumed). */
  exitConfidence: Confidence;
}

export interface Outcome {
  /** Scenario-adjusted expected value, percent of the follower's order. */
  evPct: number;
  entryRatio: number;
  exitRatio: number;
  confidence: Confidence;
  breakdown: {
    /** Spot drift between the source execution and the follower's delay. */
    entryDriftPct: number;
    /** Follower's own entry impact behind the competing flow ahead of them. */
    entryImpactPct: number;
    /** Source-exit overlap: price ratio after the source sells into the pool. */
    exitOverlapPct: number;
    /** The follower's own exit impact on the remaining depth. */
    exitOwnPct: number;
    taxesPct: number;
    fixedFeesPct: number;
  };
}

/**
 * Exit price ratio for a follower of `sizeUsd` who sells after the source's remaining
 * position has been sold. Each sale of V USD (valued at the pre-sale price) into a quote
 * reserve y executes at average ratio y/(y+V) and leaves y·ratio behind.
 */
export function followerExitRatio(inputs: ModelInputs, sizeUsd: number): { ratio: number; afterSource: number; own: number } {
  let y = Math.max(1, inputs.exitLiquidityUsd);
  const afterSource = cpSellRatio(inputs.sourceExitUsd, y);
  y = Math.max(1, y * afterSource);
  const own = cpSellRatio(sizeUsd, y);
  return { ratio: inputs.targetRatio * afterSource * own, afterSource, own };
}

/**
 * EV of a follower of `sizeUsd` entering `delayMs` after the source.
 * EV = exit·(1−sellTax)·(1−buyTax) / entry − 1 − fixedFees / size
 */
export function followerOutcome(inputs: ModelInputs, delayMs: number, sizeUsd: number): Outcome {
  const ahead = inputs.aheadUsdAt(delayMs);
  const entry: Estimate = followerEntryRatio(inputs.grid, delayMs, ahead, sizeUsd);
  const spot = inputs.grid.ratio(delayMs, Math.min(50, sizeUsd));
  const exit = followerExitRatio(inputs, sizeUsd);
  const exitRatio = exit.ratio;
  const taxes = (1 - inputs.sellTaxPct / 100) * (1 - inputs.buyTaxPct / 100);
  const fixedPct = sizeUsd > 0 ? (inputs.fixedFeesUsd / sizeUsd) * 100 : Number.POSITIVE_INFINITY;
  const gross = (exitRatio * taxes) / entry.value;
  const evPct = Number.isFinite(gross) ? (gross - 1) * 100 - fixedPct : -100;

  return {
    evPct: Math.max(-100, evPct),
    entryRatio: entry.value,
    exitRatio,
    confidence: worstConfidence(entry.confidence, spot.confidence, inputs.exitConfidence),
    breakdown: {
      entryDriftPct: (spot.value - 1) * 100,
      entryImpactPct: (entry.value / spot.value - 1) * 100,
      exitOverlapPct: (exit.afterSource - 1) * 100,
      exitOwnPct: (exit.own - 1) * 100,
      taxesPct: (taxes - 1) * 100,
      fixedFeesPct: -fixedPct,
    },
  };
}

export interface CapacityResult {
  /** C(delay, crowd): largest additional order (USD) whose scenario-adjusted EV is ≥ 0. 0 when none. */
  capacityUsd: number;
  confidence: Confidence;
  /** EV at the smallest viable order, useful to explain a zero capacity. */
  evAtMinPct: number;
}

/**
 * Solve C(d, A) = max X ≥ minSizeUsd such that EV(d, X) ≥ 0.
 *
 * EV(X) = g(X) − fees/X with g decreasing in X, so EV rises from −∞, peaks, then falls.
 * We locate the peak by golden-section search, and if the peak is non-negative bisect
 * on [peak, upper] for the upper root.
 */
export function solveCapacity(inputs: ModelInputs, delayMs: number, opts: { minSizeUsd?: number; upperUsd?: number } = {}): CapacityResult {
  const minSize = opts.minSizeUsd ?? 10;
  const upper = opts.upperUsd ?? Math.max(minSize * 2, inputs.grid.quoteLiquidityUsd * 4);
  const ev = (x: number) => followerOutcome(inputs, delayMs, x).evPct;

  // Golden-section search for the maximum of ev on [minSize, upper] in log-space.
  let lo = Math.log(minSize);
  let hi = Math.log(upper);
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = hi - phi * (hi - lo);
  let d = lo + phi * (hi - lo);
  let fc = ev(Math.exp(c));
  let fd = ev(Math.exp(d));
  for (let i = 0; i < 60; i++) {
    if (fc > fd) {
      hi = d; d = c; fd = fc; c = hi - phi * (hi - lo); fc = ev(Math.exp(c));
    } else {
      lo = c; c = d; fc = fd; d = lo + phi * (hi - lo); fd = ev(Math.exp(d));
    }
  }
  const peakX = Math.exp((lo + hi) / 2);
  const peakEv = ev(peakX);
  const evAtMin = ev(minSize);
  const conf = followerOutcome(inputs, delayMs, Math.max(minSize, peakX)).confidence;

  if (!(peakEv >= 0)) return { capacityUsd: 0, confidence: conf, evAtMinPct: evAtMin };
  if (ev(upper) >= 0) return { capacityUsd: upper, confidence: worstConfidence(conf, 'extrapolated'), evAtMinPct: evAtMin };

  let a = peakX;
  let b = upper;
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2;
    if (ev(m) >= 0) a = m; else b = m;
    if (b - a < 0.01) break;
  }
  const cap = Math.floor(a);
  return { capacityUsd: cap >= minSize ? cap : 0, confidence: followerOutcome(inputs, delayMs, Math.max(minSize, cap)).confidence, evAtMinPct: evAtMin };
}
