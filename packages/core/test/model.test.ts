import { describe, expect, it } from 'vitest';
import { buildQuoteGrid, followerOutcome, solveCapacity, type ModelInputs } from '../src';

function inputs(over: Partial<ModelInputs> = {}): ModelInputs {
  const L = 40_000;
  return {
    grid: buildQuoteGrid([], { quoteLiquidityUsd: L }),
    aheadUsdAt: () => 0,
    targetRatio: 1.4,
    sourceExitUsd: 5_000,
    exitLiquidityUsd: L,
    buyTaxPct: 0,
    sellTaxPct: 0,
    platformFeePct: 0.5,
    fixedFeesUsd: 0.05,
    exitConfidence: 'projected',
    ...over,
  };
}

describe('follower outcome', () => {
  it('is worse for larger orders (impact) and for more crowd', () => {
    const i = inputs();
    const small = followerOutcome(i, 1000, 200).evPct;
    const big = followerOutcome(i, 1000, 5000).evPct;
    expect(big).toBeLessThan(small);
    const crowded = followerOutcome(inputs({ aheadUsdAt: () => 8000 }), 1000, 200).evPct;
    expect(crowded).toBeLessThan(small);
  });

  it('thinner exit depth makes the follower\'s own exit worse', () => {
    const deep = followerOutcome(inputs({ exitLiquidityUsd: 200_000 }), 1000, 1000).evPct;
    const thin = followerOutcome(inputs({ exitLiquidityUsd: 8_000 }), 1000, 1000).evPct;
    expect(thin).toBeLessThan(deep);
  });

  it('tiny orders are eaten by fixed fees', () => {
    const i = inputs();
    expect(followerOutcome(i, 1000, 0.1).evPct).toBeLessThan(-50);
  });

  it('taxes reduce EV multiplicatively', () => {
    const base = followerOutcome(inputs(), 1000, 500).evPct;
    const taxed = followerOutcome(inputs({ buyTaxPct: 5, sellTaxPct: 5 }), 1000, 500).evPct;
    expect(taxed).toBeLessThan(base);
  });
});

describe('capacity solver', () => {
  it('finds a positive capacity when the trade has edge', () => {
    const c = solveCapacity(inputs(), 1000);
    expect(c.capacityUsd).toBeGreaterThan(100);
    expect(followerOutcome(inputs(), 1000, c.capacityUsd).evPct).toBeGreaterThanOrEqual(-0.05);
    expect(followerOutcome(inputs(), 1000, c.capacityUsd * 1.2).evPct).toBeLessThan(0);
  });

  it('returns zero when no size is scenario-compatible', () => {
    const c = solveCapacity(inputs({ targetRatio: 0.9 }), 1000);
    expect(c.capacityUsd).toBe(0);
  });

  it('capacity shrinks as competing flow grows', () => {
    const a = solveCapacity(inputs(), 1000).capacityUsd;
    const b = solveCapacity(inputs({ aheadUsdAt: () => 1000 }), 1000).capacityUsd;
    const c = solveCapacity(inputs({ aheadUsdAt: () => 3000 }), 1000).capacityUsd;
    expect(b).toBeLessThan(a);
    expect(c).toBeLessThan(b);
  });
});
