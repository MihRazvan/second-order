/**
 * Quote grid: a sparse set of observed quotes over (delay, size) turned into a
 * continuous entry-price function by interpolation, with explicit confidence.
 *
 * Conventions
 * - `ratio` is the average execution price of a single order of `sizeUsd` placed at
 *   `delayMs` after the source trade, divided by the source's own execution price.
 *   1.00 = identical to the source; 1.05 = 5% worse.
 * - Interpolation is linear in delay and linear in log(size).
 * - Above the largest observed size the curve is extrapolated with a constant-product
 *   term calibrated to the largest observed point (confidence `extrapolated`).
 * - Beyond the last observed delay the latest observed curve is held (confidence `projected`).
 * - With no observations at all a pure constant-product model on the market liquidity
 *   is used (confidence `model`).
 */

export type Confidence = 'observed' | 'projected' | 'extrapolated' | 'model';

export const CONFIDENCE_RANK: Record<Confidence, number> = {
  observed: 0,
  projected: 1,
  extrapolated: 2,
  model: 3,
};

export function worstConfidence(...c: Confidence[]): Confidence {
  return c.reduce((acc, x) => (CONFIDENCE_RANK[x] > CONFIDENCE_RANK[acc] ? x : acc), 'observed');
}

export interface GridQuote {
  delayMs: number;
  sizeUsd: number;
  ratio: number;
}

export interface Estimate {
  value: number;
  confidence: Confidence;
}

export interface QuoteGrid {
  /** Sorted distinct observed delays. Empty when model-only. */
  delays: number[];
  /** Ratio for a single order of `sizeUsd` at `delayMs`. */
  ratio(delayMs: number, sizeUsd: number): Estimate;
  /** Quote-side liquidity (USD) used for the constant-product fallback. */
  quoteLiquidityUsd: number;
  observedCount: number;
  /**
   * Execution depth (USD) implied by the observed impact at the nearest delay column:
   * L = sizeMax / (r(sizeMax) / r(sizeMin) − 1). Null when it cannot be measured.
   */
  impliedDepthUsd(delayMs: number): number | null;
}

interface DelayCurve {
  delayMs: number;
  sizes: number[]; // sorted asc
  ratios: number[];
}

/** Constant-product average buy price ratio for `x` USD into a pool with quote reserve `L`. */
export function cpBuyRatio(x: number, quoteLiquidityUsd: number): number {
  if (quoteLiquidityUsd <= 0) return Number.POSITIVE_INFINITY;
  return 1 + x / quoteLiquidityUsd;
}

/** Constant-product average sell price ratio when `v` USD of tokens (at current price) hits quote reserve `L`. */
export function cpSellRatio(v: number, quoteLiquidityUsd: number): number {
  if (quoteLiquidityUsd <= 0) return 0;
  return quoteLiquidityUsd / (quoteLiquidityUsd + v);
}

function interpCurve(curve: DelayCurve, sizeUsd: number): Estimate {
  const { sizes, ratios } = curve;
  const n = sizes.length;
  if (n === 0) return { value: Number.NaN, confidence: 'model' };
  const minS = sizes[0]!;
  const maxS = sizes[n - 1]!;
  if (n === 1 || sizeUsd <= minS) {
    // Below the smallest observed size we hold the smallest observation. Slightly
    // conservative (a smaller order would have less impact) and never optimistic.
    return { value: ratios[0]!, confidence: 'observed' };
  }
  if (sizeUsd >= maxS) {
    if (sizeUsd === maxS) return { value: ratios[n - 1]!, confidence: 'observed' };
    // Calibrate a constant-product term to the two largest points: spot ≈ smallest
    // observation's ratio, impact slope from the largest observation.
    const spot = ratios[0]!;
    const rMax = ratios[n - 1]!;
    const slope = Math.max(rMax / spot - 1, 1e-9) / maxS; // (ratio/spot − 1) per USD
    return { value: spot * (1 + slope * sizeUsd), confidence: 'extrapolated' };
  }
  let i = 1;
  while (i < n && sizes[i]! < sizeUsd) i++;
  const s0 = sizes[i - 1]!;
  const s1 = sizes[i]!;
  const t = (Math.log(sizeUsd) - Math.log(s0)) / (Math.log(s1) - Math.log(s0));
  return { value: ratios[i - 1]! + t * (ratios[i]! - ratios[i - 1]!), confidence: 'observed' };
}

export interface BuildGridOptions {
  /** Quote-side liquidity in USD for the model fallback and extrapolation guardrail. */
  quoteLiquidityUsd: number;
  /** Spot price ratio vs the source execution right after the source trade (model fallback only). Default 1. */
  spotRatio?: number;
  /** Delays closer than this are treated as the same observation column (ms). Default 250. */
  delayBucketMs?: number;
  /** Only quotes observed at or before this event time are used. */
  upToAt?: number;
}

export function buildQuoteGrid(quotes: GridQuote[], opts: BuildGridOptions): QuoteGrid {
  const bucket = opts.delayBucketMs ?? 250;
  const byDelay = new Map<number, Map<number, number[]>>();
  for (const q of quotes) {
    if (!Number.isFinite(q.ratio) || q.ratio <= 0 || q.sizeUsd <= 0) continue;
    const d = Math.round(q.delayMs / bucket) * bucket;
    let sizes = byDelay.get(d);
    if (!sizes) byDelay.set(d, (sizes = new Map()));
    const arr = sizes.get(q.sizeUsd) ?? [];
    arr.push(q.ratio);
    sizes.set(q.sizeUsd, arr);
  }
  const curves: DelayCurve[] = [...byDelay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([delayMs, sizes]) => {
      const entries = [...sizes.entries()].sort((a, b) => a[0] - b[0]);
      return {
        delayMs,
        sizes: entries.map(([s]) => s),
        // Lower median of repeated observations at the same point (robust to a single outlier).
        ratios: entries.map(([, rs]) => {
          const sorted = [...rs].sort((a, b) => a - b);
          return sorted[Math.floor((sorted.length - 1) / 2)]!;
        }),
      };
    });

  const L = opts.quoteLiquidityUsd;
  const spot = opts.spotRatio ?? 1;
  const observedCount = quotes.length;

  if (curves.length === 0) {
    return {
      delays: [],
      quoteLiquidityUsd: L,
      observedCount: 0,
      ratio: (_d, sizeUsd) => ({ value: spot * cpBuyRatio(sizeUsd, L), confidence: 'model' }),
      impliedDepthUsd: () => null,
    };
  }

  const nearest = (delayMs: number): DelayCurve => {
    let best = curves[0]!;
    for (const c of curves) if (Math.abs(c.delayMs - delayMs) < Math.abs(best.delayMs - delayMs)) best = c;
    return best;
  };
  const impliedDepthUsd = (delayMs: number): number | null => {
    const c = nearest(delayMs);
    const n = c.sizes.length;
    if (n < 2) return null;
    const rMin = c.ratios[0]!;
    const rMax = c.ratios[n - 1]!;
    const sMax = c.sizes[n - 1]!;
    const sMin = c.sizes[0]!;
    if (!(rMax > rMin)) return null;
    // Average-price CP ratio: r(X) = spot·(1 + X/L). Two points remove the spot: L = (sMax − sMin·rMax/rMin) / (rMax/rMin − 1).
    const k = rMax / rMin;
    const L = (sMax - sMin * k) / (k - 1);
    return Number.isFinite(L) && L > 0 ? L : null;
  };

  const ratio = (delayMs: number, sizeUsd: number): Estimate => {
    const first = curves[0]!;
    const last = curves[curves.length - 1]!;
    if (delayMs <= first.delayMs) {
      const e = interpCurve(first, sizeUsd);
      return { value: e.value, confidence: worstConfidence(e.confidence, delayMs < first.delayMs ? 'projected' : 'observed') };
    }
    if (delayMs >= last.delayMs) {
      const e = interpCurve(last, sizeUsd);
      return { value: e.value, confidence: worstConfidence(e.confidence, delayMs > last.delayMs ? 'projected' : 'observed') };
    }
    let i = 1;
    while (i < curves.length && curves[i]!.delayMs < delayMs) i++;
    const c0 = curves[i - 1]!;
    const c1 = curves[i]!;
    const t = (delayMs - c0.delayMs) / (c1.delayMs - c0.delayMs);
    const e0 = interpCurve(c0, sizeUsd);
    const e1 = interpCurve(c1, sizeUsd);
    return { value: e0.value + t * (e1.value - e0.value), confidence: worstConfidence(e0.confidence, e1.confidence) };
  };

  return { delays: curves.map((c) => c.delayMs), quoteLiquidityUsd: L, observedCount, ratio, impliedDepthUsd };
}

/**
 * Average price ratio paid by a follower of `sizeUsd` who enters at `delayMs` behind
 * `aheadUsd` of same-direction flow that arrived before them at that delay.
 *
 * Derivation: an order of X USD receives Q(X) = X / ratio(X) tokens (in source-price
 * units). The follower receives Q(A+s) − Q(A) tokens for s USD, so their average
 * price ratio is s / (Q(A+s) − Q(A)).
 */
export function followerEntryRatio(grid: QuoteGrid, delayMs: number, aheadUsd: number, sizeUsd: number): Estimate {
  if (sizeUsd <= 0) return { value: Number.NaN, confidence: 'model' };
  const a = Math.max(0, aheadUsd);
  const rA = a > 0 ? grid.ratio(delayMs, a) : { value: 1, confidence: 'observed' as Confidence };
  const rB = grid.ratio(delayMs, a + sizeUsd);
  const qA = a > 0 ? a / rA.value : 0;
  const qB = (a + sizeUsd) / rB.value;
  const tokens = qB - qA;
  const conf = worstConfidence(rA.confidence, rB.confidence);
  if (!(tokens > 0)) return { value: Number.POSITIVE_INFINITY, confidence: conf };
  return { value: sizeUsd / tokens, confidence: conf };
}
