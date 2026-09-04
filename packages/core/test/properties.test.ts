import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@second-order/contracts';
import { buildQuoteGrid, crowdGuard, deriveInputs, followerOutcome, initialScenarioState, mulberry32, reduceScenario, solveCapacity, DEFAULT_POLICY, type ModelInputs } from '../src';

/** Seeded property checks. No external property-testing dependency; the PRNG is the project's own. */
const rng = mulberry32(99);
const pick = (lo: number, hi: number) => lo + (hi - lo) * rng();

function randomInputs(): ModelInputs {
  const L = pick(5_000, 500_000);
  const spot = pick(1.0, 1.3);
  const quotes = [500, 2000, 8000].flatMap((d) => [100, 1000, 5000].map((s) => ({ delayMs: d, sizeUsd: s, ratio: spot * (1 + d / 200_000) * (1 + s / L) })));
  return {
    grid: buildQuoteGrid(quotes, { quoteLiquidityUsd: L, spotRatio: spot }),
    aheadUsdAt: () => 0,
    targetRatio: pick(0.9, 2.0),
    sourceExitUsd: pick(0, L * 0.3),
    exitLiquidityUsd: pick(L * 0.05, L),
    buyTaxPct: pick(0, 5),
    sellTaxPct: pick(0, 5),
    platformFeePct: pick(0, 1),
    fixedFeesUsd: pick(0.01, 2),
    exitConfidence: 'projected',
  };
}

describe('model properties', () => {
  it('EV is non-increasing in size (fixed fees aside, which are tested separately)', () => {
    for (let n = 0; n < 200; n++) {
      const inputs = { ...randomInputs(), fixedFeesUsd: 0 };
      const d = pick(300, 10_000);
      const sizes = [200, 400, 800, 1600, 3200, 6400];
      const evs = sizes.map((s) => followerOutcome(inputs, d, s).evPct);
      for (let i = 1; i < evs.length; i++) expect(evs[i]!).toBeLessThanOrEqual(evs[i - 1]! + 1e-6);
    }
  });

  it('EV is non-increasing in flow ahead of the follower', () => {
    for (let n = 0; n < 200; n++) {
      const base = randomInputs();
      const d = pick(300, 10_000);
      const evs = [0, 1000, 5000, 20000].map((a) => followerOutcome({ ...base, aheadUsdAt: () => a }, d, 500).evPct);
      for (let i = 1; i < evs.length; i++) expect(evs[i]!).toBeLessThanOrEqual(evs[i - 1]! + 1e-6);
    }
  });

  it('capacity is scenario-compatible at itself and not just above it', () => {
    for (let n = 0; n < 200; n++) {
      const inputs = randomInputs();
      const d = pick(300, 10_000);
      const c = solveCapacity(inputs, d, { minSizeUsd: 25 });
      if (c.capacityUsd > 0) {
        expect(followerOutcome(inputs, d, c.capacityUsd).evPct).toBeGreaterThanOrEqual(-0.05);
        expect(followerOutcome(inputs, d, c.capacityUsd * 1.5 + 50).evPct).toBeLessThan(0.05);
      }
    }
  });

  it('capacity never increases when exit depth shrinks or fees rise', () => {
    for (let n = 0; n < 100; n++) {
      const inputs = randomInputs();
      const d = pick(300, 10_000);
      const a = solveCapacity(inputs, d).capacityUsd;
      const b = solveCapacity({ ...inputs, exitLiquidityUsd: inputs.exitLiquidityUsd * 0.5 }, d).capacityUsd;
      const c = solveCapacity({ ...inputs, platformFeePct: inputs.platformFeePct + 1 }, d).capacityUsd;
      expect(b).toBeLessThanOrEqual(a + 1);
      expect(c).toBeLessThanOrEqual(a + 1);
    }
  });
});

describe('fail-conservative properties', () => {
  const prov = { kind: 'demo-scenario', source: 'replay' } as const;
  const token = { address: '0xt', symbol: 'T', decimals: 18 };
  let seq = 0;
  const ev = (type: DomainEvent['type'], at: number, payload: unknown): DomainEvent => ({ v: 1, id: `${type}-${at}-${seq}`, seq: seq++, at, sessionId: 's', provenance: prov, type, payload }) as DomainEvent;

  function healthy() {
    let s = initialScenarioState();
    s = reduceScenario(s, ev('source.trade', 0, { wallet: '0xs', chainId: 'evm:1', token, quoteToken: token, side: 'buy', sizeUsd: 5000, tokenAmount: 1, executionPriceUsd: 1, txHash: '0x1', feesUsd: 0.05, platformFeesUsd: 25 }));
    s = reduceScenario(s, ev('source.profile', 0, { wallet: '0xs', periodDays: 30, realizedRatePct: 100, realizedPnlUsd: 1, winRatePct: 50, typicalGainPct: 60, tradeCount: 10, labels: [], chains: [] }));
    s = reduceScenario(s, ev('market.snapshot', 0, { chainId: 'evm:1', poolAddress: '0xp', poolType: null, exchange: null, priceUsd: 1.02, liquidityUsd: 400_000, volume1hUsd: null, volume24hUsd: null, priceChange1hPct: null, latestTradeAt: null, observedAt: 0 }));
    s = reduceScenario(s, ev('security.snapshot', 0, { chainId: 'evm:1', address: '0xt', isHoneypot: false, buyFeePct: 0, sellFeePct: 0, transferFeePct: 0, isMintable: false, isFreezable: null, transferPausable: false, balanceMutable: false, selfDestruct: false, isBlacklisted: false, modifyableTax: false, renounced: true, lpLockedShare: 1, liquidityBurnPct: 0, top10HoldingsPct: 10, staticAnalysisStatus: 'completed', completeness: 1, observedAt: 0 }));
    for (const d of [500, 1000, 3000]) for (const size of [100, 1000, 5000]) {
      s = reduceScenario(s, ev('quote.observed', d, { chainId: 'evm:1', tokenIn: '0xq', tokenOut: '0xt', delayMs: d, sizeUsd: size, amountOutUsd: size, effectivePriceRatio: 1.02 * (1 + size / 200_000), priceImpactPct: null, slippagePct: null, feesUsd: null, latencyMs: 1, quotedAt: d, source: 'quoting-wss' }));
    }
    return s;
  }

  it('a healthy state can ALLOW a modest order', () => {
    expect(crowdGuard(healthy(), { sizeUsd: 200, delayMs: 1000 }, DEFAULT_POLICY, 3000).decision).toBe('ALLOW');
  });

  it('no ALLOW for any size or delay when quotes are stale', () => {
    const s = healthy();
    for (let n = 0; n < 50; n++) {
      const v = crowdGuard(s, { sizeUsd: pick(10, 5000), delayMs: pick(300, 20_000) }, DEFAULT_POLICY, 3000 + DEFAULT_POLICY.quoteStaleAfterMs + 1);
      expect(v.decision).not.toBe('ALLOW');
    }
  });

  it('no ALLOW when the stream is stale or reconnecting', () => {
    for (const state of ['stale', 'reconnecting'] as const) {
      const s = reduceScenario(healthy(), ev('stream.status', 3000, { provider: 'mobula', state }));
      expect(crowdGuard(s, { sizeUsd: 200, delayMs: 1000 }, DEFAULT_POLICY, 3000).decision).not.toBe('ALLOW');
    }
  });

  it('no ALLOW without market or security snapshots', () => {
    const noSec = healthy();
    noSec.security = null;
    expect(crowdGuard(noSec, { sizeUsd: 200, delayMs: 1000 }, DEFAULT_POLICY, 3000).decision).not.toBe('ALLOW');
    const noMkt = healthy();
    noMkt.market = null;
    expect(crowdGuard(noMkt, { sizeUsd: 200, delayMs: 1000 }, DEFAULT_POLICY, 3000).decision).not.toBe('ALLOW');
  });

  it('BLOCK on every critical flag regardless of outcome', () => {
    for (const flag of ['isHoneypot', 'balanceMutable', 'selfDestruct'] as const) {
      const s = healthy();
      s.security = { ...s.security!, [flag]: true };
      expect(crowdGuard(s, { sizeUsd: 50, delayMs: 500 }, DEFAULT_POLICY, 3000).decision).toBe('BLOCK');
    }
  });

  it('replaying the same events in any order of duplicates yields the same derived inputs', () => {
    const s1 = healthy();
    const events = [...s1.quotes];
    let s2 = healthy();
    for (const q of events) s2 = reduceScenario(s2, ev('quote.observed', q.at, q)); // new ids → not duplicates
    const d1 = deriveInputs(s1, { nowAt: 3000 })!;
    const d2 = deriveInputs(s2, { nowAt: 3000 })!;
    // Doubling identical observations changes nothing but the count (median is stable).
    expect(d2.inputs.grid.ratio(1000, 1000).value).toBeCloseTo(d1.inputs.grid.ratio(1000, 1000).value, 9);
  });
});
