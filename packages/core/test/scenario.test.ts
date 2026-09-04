import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@second-order/contracts';
import { crowdGuard, deriveInputs, initialScenarioState, reduceScenario, sampleShadowFollowers, evaluateShadowFollowers, DEFAULT_POLICY } from '../src';

const prov = { kind: 'demo-scenario', source: 'replay' } as const;
const token = { address: '0xtoken', symbol: 'TKN', decimals: 18 };
const weth = { address: '0xweth', symbol: 'WETH', decimals: 18 };
let seq = 0;
const ev = <T extends DomainEvent['type']>(type: T, at: number, payload: Extract<DomainEvent, { type: T }>['payload'], id = `${type}-${at}-${seq}`): DomainEvent =>
  ({ v: 1, id, seq: seq++, at, sessionId: 's', provenance: prov, type, payload }) as DomainEvent;

function baseState(withSecurity = true) {
  let s = initialScenarioState();
  s = reduceScenario(s, ev('source.trade', 0, { wallet: '0xsrc', chainId: 'evm:8453', token, quoteToken: weth, side: 'buy', sizeUsd: 18500, tokenAmount: 1, executionPriceUsd: 0.04, txHash: '0x1', feesUsd: 0.05, platformFeesUsd: 92.5 }));
  s = reduceScenario(s, ev('source.profile', 0, { wallet: '0xsrc', periodDays: 90, realizedRatePct: 186, realizedPnlUsd: 90000, winRatePct: 61, typicalGainPct: 40, tradeCount: 120, labels: [], chains: ['evm:8453'] }));
  s = reduceScenario(s, ev('market.snapshot', 0, { chainId: 'evm:8453', poolAddress: '0xpool', poolType: 'uniswap-v3', exchange: 'Uniswap', priceUsd: 0.04, liquidityUsd: 400000, volume1hUsd: 1000, volume24hUsd: 5000, priceChange1hPct: 1, latestTradeAt: 0, observedAt: 0 }));
  if (withSecurity) {
    s = reduceScenario(s, ev('security.snapshot', 0, { chainId: 'evm:8453', address: '0xtoken', isHoneypot: false, buyFeePct: 0, sellFeePct: 0, transferFeePct: 0, isMintable: false, isFreezable: null, transferPausable: false, balanceMutable: false, selfDestruct: false, isBlacklisted: false, modifyableTax: false, renounced: true, lpLockedShare: 0.9, liquidityBurnPct: 10, top10HoldingsPct: 30, staticAnalysisStatus: 'completed', completeness: 1, observedAt: 0 }));
  }
  for (const d of [500, 1000, 2000, 5000]) {
    for (const size of [100, 1000, 5000]) {
      s = reduceScenario(s, ev('quote.observed', d, { chainId: 'evm:8453', tokenIn: '0xweth', tokenOut: '0xtoken', delayMs: d, sizeUsd: size, amountOutUsd: size, effectivePriceRatio: (1 + d / 100000) * (1 + size / 200000), priceImpactPct: null, slippagePct: null, feesUsd: null, latencyMs: 30, quotedAt: d, source: 'quoting-wss' }));
    }
  }
  return s;
}

describe('scenario reducer', () => {
  it('ignores duplicate event ids', () => {
    let s = baseState();
    const before = s.quotes.length;
    const dup = ev('quote.observed', 500, { chainId: 'evm:8453', tokenIn: '0xweth', tokenOut: '0xtoken', delayMs: 500, sizeUsd: 100, amountOutUsd: 100, effectivePriceRatio: 1.01, priceImpactPct: null, slippagePct: null, feesUsd: null, latencyMs: 30, quotedAt: 500, source: 'quoting-wss' }, 'dup');
    s = reduceScenario(s, dup);
    s = reduceScenario(s, dup);
    expect(s.quotes.length).toBe(before + 1);
    expect(s.duplicates).toBe(1);
  });

  it('derives inputs with observed quotes and no issues', () => {
    const d = deriveInputs(baseState(), { nowAt: 5000 })!;
    expect(d.quality.degraded).toBe(false);
    expect(d.inputs.grid.observedCount).toBe(12);
    expect(d.inputs.exitConfidence).toBe('projected');
  });
});

describe('crowdGuard', () => {
  it('ALLOWs a modest order on a fresh, uncrowded trade', () => {
    const v = crowdGuard(baseState(), { sizeUsd: 300, delayMs: 2000 }, DEFAULT_POLICY, 5000);
    expect(v.decision).toBe('ALLOW');
    expect(v.evPct).toBeGreaterThan(DEFAULT_POLICY.minEvPct);
    const resized = crowdGuard(baseState(), { sizeUsd: v.maxCompatibleUsd, delayMs: 2000 }, DEFAULT_POLICY, 5000);
    expect(resized.decision).toBe('ALLOW');
  });

  it('RESIZEs when the order exceeds capacity', () => {
    const v = crowdGuard(baseState(), { sizeUsd: 40000, delayMs: 2000 }, DEFAULT_POLICY, 5000);
    expect(v.decision).toBe('RESIZE');
    expect(v.maxCompatibleUsd).toBeGreaterThan(0);
    expect(v.maxCompatibleUsd).toBeLessThan(40000);
  });

  it('never ALLOWs without a security snapshot', () => {
    const v = crowdGuard(baseState(false), { sizeUsd: 300, delayMs: 2000 }, DEFAULT_POLICY, 5000);
    expect(v.decision).not.toBe('ALLOW');
    expect(v.reasons.join(' ')).toMatch(/security/i);
  });

  it('never ALLOWs on stale quotes', () => {
    const v = crowdGuard(baseState(), { sizeUsd: 300, delayMs: 2000 }, DEFAULT_POLICY, 5000 + DEFAULT_POLICY.quoteStaleAfterMs + 1);
    expect(v.decision).not.toBe('ALLOW');
  });

  it('BLOCKs on a honeypot regardless of EV', () => {
    let s = baseState();
    s = reduceScenario(s, ev('security.snapshot', 100, { ...s.security!, isHoneypot: true }, 'sec2'));
    const v = crowdGuard(s, { sizeUsd: 100, delayMs: 2000 }, DEFAULT_POLICY, 5000);
    expect(v.decision).toBe('BLOCK');
  });

  it('degrades as quotes deteriorate and a source exit arrives', () => {
    let s = baseState();
    const before = crowdGuard(s, { sizeUsd: 1000, delayMs: 5000 }, DEFAULT_POLICY, 5000);
    for (let i = 0; i < 40; i++) {
      s = reduceScenario(s, ev('flow.competing', 1000 + i * 200, { chainId: 'evm:8453', token, wallet: `0xw${i}`, side: 'buy', sizeUsd: 600, delayMs: 1000 + i * 200, txHash: `0xf${i}`, labels: [] }));
    }
    // Later quotes: price has run up and depth has thinned (steeper impact per dollar).
    for (const size of [100, 1000, 5000]) {
      s = reduceScenario(s, ev('quote.observed', 9000, { chainId: 'evm:8453', tokenIn: '0xweth', tokenOut: '0xtoken', delayMs: 9000, sizeUsd: size, amountOutUsd: size, effectivePriceRatio: 1.2 * (1 + size / 8000), priceImpactPct: null, slippagePct: null, feesUsd: null, latencyMs: 30, quotedAt: 9000, source: 'quoting-wss' }));
    }
    s = reduceScenario(s, ev('source.exit', 9000, { wallet: '0xsrc', chainId: 'evm:8453', token, sizeUsd: 15000, fractionOfPosition: 0.6, executionPriceUsd: 0.05, priceRatioVsEntry: 1.25, txHash: '0xexit', delayMs: 9000 }));
    const after = crowdGuard(s, { sizeUsd: 1000, delayMs: 5000 }, DEFAULT_POLICY, 9000);
    expect(after.evPct).toBeLessThan(before.evPct);
    expect(after.maxCompatibleUsd).toBeLessThan(before.maxCompatibleUsd);
    expect(after.quality?.sourceExitWitnessed).toBe(true);
    expect(after.decision).not.toBe('ALLOW');
  });
});

describe('shadow followers', () => {
  it('samples exactly 100 deterministic scenarios', () => {
    const a = sampleShadowFollowers();
    const b = sampleShadowFollowers();
    expect(a).toHaveLength(100);
    expect(a).toEqual(b);
    const out = evaluateShadowFollowers(deriveInputs(baseState(), { nowAt: 5000 })!, a);
    expect(out.every((o) => Number.isFinite(o.evPct))).toBe(true);
  });
});
