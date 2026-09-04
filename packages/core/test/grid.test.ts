import { describe, expect, it } from 'vitest';
import { buildQuoteGrid, cpBuyRatio, followerEntryRatio } from '../src';

const L = 30_000;
const quotes = [
  { delayMs: 1000, sizeUsd: 100, ratio: 1.01 * cpBuyRatio(100, L) },
  { delayMs: 1000, sizeUsd: 1000, ratio: 1.01 * cpBuyRatio(1000, L) },
  { delayMs: 1000, sizeUsd: 5000, ratio: 1.01 * cpBuyRatio(5000, L) },
  { delayMs: 5000, sizeUsd: 100, ratio: 1.05 * cpBuyRatio(100, L) },
  { delayMs: 5000, sizeUsd: 1000, ratio: 1.05 * cpBuyRatio(1000, L) },
  { delayMs: 5000, sizeUsd: 5000, ratio: 1.05 * cpBuyRatio(5000, L) },
];

describe('quote grid', () => {
  it('falls back to a constant-product model with no quotes', () => {
    const g = buildQuoteGrid([], { quoteLiquidityUsd: L });
    const e = g.ratio(2000, 3000);
    expect(e.confidence).toBe('model');
    expect(e.value).toBeCloseTo(1.1, 6);
  });

  it('interpolates linearly in delay between observed columns', () => {
    const g = buildQuoteGrid(quotes, { quoteLiquidityUsd: L });
    const e = g.ratio(3000, 1000);
    expect(e.confidence).toBe('observed');
    expect(e.value).toBeCloseTo(1.03 * cpBuyRatio(1000, L), 6);
  });

  it('marks delays beyond the last column as projected', () => {
    const g = buildQuoteGrid(quotes, { quoteLiquidityUsd: L });
    expect(g.ratio(9000, 1000).confidence).toBe('projected');
  });

  it('marks sizes beyond the largest observation as extrapolated and monotone', () => {
    const g = buildQuoteGrid(quotes, { quoteLiquidityUsd: L });
    const a = g.ratio(1000, 5000);
    const b = g.ratio(1000, 20000);
    expect(b.confidence).toBe('extrapolated');
    expect(b.value).toBeGreaterThan(a.value);
  });

  it('a follower behind flow pays more than one in front', () => {
    const g = buildQuoteGrid(quotes, { quoteLiquidityUsd: L });
    const front = followerEntryRatio(g, 1000, 0, 500).value;
    const behind = followerEntryRatio(g, 1000, 3000, 500).value;
    expect(behind).toBeGreaterThan(front);
  });

  it('deduplicates repeated observations by median', () => {
    const g = buildQuoteGrid([...quotes, { delayMs: 1000, sizeUsd: 1000, ratio: 9 }], { quoteLiquidityUsd: L });
    expect(g.ratio(1000, 1000).value).toBeLessThan(2);
  });
});
