/**
 * Deterministic generator for the demo fixture. A constant-product pool is simulated
 * so quotes, competing flow and the source exit are mutually consistent. Output is
 * validated against @second-order/contracts and written to fixtures/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReplayFile, type DomainEvent, type Provenance } from '@second-order/contracts';
import { mulberry32 } from '@second-order/core';
import { DEMO_CONFIG, type DemoConfig } from './scenario-config';

type Cfg = DemoConfig;

/**
 * Constant-product pool whose active depth thins as the price leaves the initial
 * range, the way concentrated-liquidity pools behave once the price runs past the
 * bulk of LP positions. After every trade the reserves are rescaled to the active
 * depth at the new price, keeping the price itself unchanged.
 */
class Pool {
  x: number; // token reserve (in tokens)
  y: number; // quote reserve (USD)
  private p0: number;
  private minL: number;
  constructor(private L0: number, priceUsd: number, private decay: number, private floor: number) {
    this.y = L0;
    this.x = L0 / priceUsd;
    this.p0 = priceUsd;
    this.minL = L0;
  }
  get price() { return this.y / this.x; }
  get depth() { return this.y; }
  private rebalance() {
    const p = this.price;
    if (!Number.isFinite(p) || p <= 0) throw new Error('pool degenerate');
    // Active depth thins as the price runs and does not come back within the window
    // (positions left behind, LPs withdrawing into the move). Never below 3% of the
    // initial depth: some liquidity is always full-range.
    const L = Math.max(this.L0 * this.floor, this.L0 / Math.pow(1 + this.decay * Math.abs(Math.log(p / this.p0)), 2));
    this.minL = Math.min(this.minL, L);
    this.y = this.minL;
    this.x = this.minL / p;
  }
  /** Buy with `usd`; returns tokens out and average price. */
  buy(usd: number) {
    const k = this.x * this.y;
    const x1 = k / (this.y + usd);
    const out = this.x - x1;
    this.y += usd;
    this.x = x1;
    this.rebalance();
    return { tokens: out, avgPrice: usd / out };
  }
  /** Sell `tokens`; returns usd out and average price. */
  sell(tokens: number) {
    const k = this.x * this.y;
    const y1 = k / (this.x + tokens);
    const out = this.y - y1;
    this.x += tokens;
    this.y = y1;
    this.rebalance();
    return { usd: out, avgPrice: out / tokens };
  }
  /** Quote a buy without mutating. */
  quoteBuy(usd: number) {
    const k = this.x * this.y;
    const out = this.x - k / (this.y + usd);
    return { tokens: out, avgPrice: usd / out };
  }
}

export function generateDemo(cfg: Cfg = DEMO_CONFIG) {
  const rng = mulberry32(cfg.seed);
  const prov: Provenance = { kind: 'demo-scenario', source: 'replay', replayId: 'demo-crowd-capture.v1' };
  const events: DomainEvent[] = [];
  let seq = 0;
  const push = <T extends DomainEvent['type']>(type: T, at: number, payload: Extract<DomainEvent, { type: T }>['payload'], id: string) => {
    events.push({ v: 1, id, seq: seq++, at, sessionId: cfg.sessionId, provenance: prov, type, payload } as DomainEvent);
  };
  const hex = (n = 64) => '0x' + Array.from({ length: n }, () => Math.floor(rng() * 16).toString(16)).join('');

  const pool = new Pool(cfg.quoteLiquidityUsd, cfg.sourcePriceUsd, cfg.depthDecay, cfg.depthFloor);

  // t=0: context
  push('stream.status', 0, { provider: 'replay', state: 'connected', speed: cfg.defaultSpeed, message: 'Demo scenario replay' }, 'status-0');
  push('source.profile', 0, {
    wallet: cfg.sourceWallet, displayName: undefined, periodDays: cfg.profile.periodDays, realizedRatePct: cfg.profile.realizedRatePct,
    realizedPnlUsd: cfg.profile.realizedPnlUsd, winRatePct: cfg.profile.winRatePct, typicalGainPct: cfg.profile.typicalGainPct,
    tradeCount: cfg.profile.tradeCount, labels: ['smart-money'], chains: [cfg.chainId],
  }, 'profile-0');
  push('security.snapshot', 0, {
    chainId: cfg.chainId, address: cfg.token.address, isHoneypot: false, buyFeePct: 0, sellFeePct: 0, transferFeePct: 0,
    isMintable: false, isFreezable: null, transferPausable: false, balanceMutable: false, selfDestruct: false, isBlacklisted: false,
    modifyableTax: false, renounced: true, lpLockedShare: 0.82, liquidityBurnPct: 12.4, top10HoldingsPct: 41.7,
    staticAnalysisStatus: 'completed', completeness: 17 / 18, observedAt: 0,
  }, 'security-0');

  // Source trade at t=0 moves the pool.
  const src = pool.buy(cfg.sourceSizeUsd);
  const sourcePrice = src.avgPrice;
  push('source.trade', 0, {
    wallet: cfg.sourceWallet, chainId: cfg.chainId, token: cfg.token, quoteToken: cfg.quoteToken, side: 'buy', sizeUsd: cfg.sourceSizeUsd,
    tokenAmount: src.tokens, executionPriceUsd: sourcePrice, txHash: hex(), poolAddress: cfg.poolAddress, platform: 'Uniswap V3', feesUsd: cfg.sourceFeesUsd, platformFeesUsd: +(cfg.sourceSizeUsd * cfg.platformFeePct / 100).toFixed(2),
  }, 'source-trade-0');
  push('scenario.marker', 0, { label: 'Source trade observed', severity: 'info' }, 'marker-trade');
  // Market snapshot taken right after the source trade: carries the post-trade spot and reported liquidity.
  push('market.snapshot', 0, {
    chainId: cfg.chainId, poolAddress: cfg.poolAddress, poolType: 'uniswap-v3', exchange: 'Uniswap V3', priceUsd: pool.price,
    liquidityUsd: cfg.quoteLiquidityUsd * 2, volume1hUsd: 3_900, volume24hUsd: 61_200, priceChange1hPct: 2.1, latestTradeAt: 0, observedAt: 0,
  }, 'market-0');

  // Competing flow schedule: front-loaded burst then steady.
  const flows: { at: number; usd: number }[] = [];
  const f = cfg.flow;
  const burstCount = Math.round(f.count * f.burstShare);
  const weights: number[] = [];
  for (let i = 0; i < f.count; i++) {
    const inBurst = i < burstCount;
    const at = inBurst
      ? f.startMs + Math.pow(rng(), 1.6) * (f.burstUntilMs - f.startMs)
      : f.burstUntilMs + rng() * (f.endMs - f.burstUntilMs);
    // lognormal-ish sizes, a few whales
    const w = Math.exp(rng() * 2.2 - 1.1) * (rng() < 0.08 ? 6 : 1);
    weights.push(w);
    flows.push({ at: Math.round(at), usd: w });
  }
  const wsum = weights.reduce((a, b) => a + b, 0);
  for (const fl of flows) fl.usd = Math.round((fl.usd / wsum) * f.totalUsd);
  flows.sort((a, b) => a.at - b.at);

  // Timeline: merge flows, quotes and the source exit in event-time order.
  type Item = { at: number; kind: 'flow' | 'quote' | 'exit'; idx?: number };
  const items: Item[] = [];
  flows.forEach((fl, idx) => items.push({ at: fl.at, kind: 'flow', idx }));
  for (let t = cfg.quotes.firstAtMs; t <= cfg.quotes.endMs; t += cfg.quotes.everyMs) items.push({ at: t, kind: 'quote' });
  items.push({ at: cfg.sourceExit.atMs, kind: 'exit' });
  items.sort((a, b) => a.at - b.at || (a.kind === 'quote' ? 1 : -1));

  let sourceTokensLeft = src.tokens;
  let exitDone = false;
  let quoteSeq = 0;
  for (const it of items) {
    if (it.kind === 'flow') {
      const fl = flows[it.idx!]!;
      pool.buy(fl.usd);
      push('flow.competing', fl.at, {
        chainId: cfg.chainId, token: cfg.token, wallet: hex(40), side: 'buy', sizeUsd: fl.usd, delayMs: fl.at, txHash: hex(), labels: rng() < 0.2 ? ['fresh-wallet'] : [],
      }, `flow-${it.idx}`);
    } else if (it.kind === 'exit' && !exitDone) {
      exitDone = true;
      const tokens = sourceTokensLeft * cfg.sourceExit.fraction;
      const r = pool.sell(tokens);
      sourceTokensLeft -= tokens;
      push('source.exit', it.at, {
        wallet: cfg.sourceWallet, chainId: cfg.chainId, token: cfg.token, sizeUsd: Math.round(r.usd), fractionOfPosition: cfg.sourceExit.fraction,
        executionPriceUsd: r.avgPrice, priceRatioVsEntry: r.avgPrice / sourcePrice, txHash: hex(), delayMs: it.at,
      }, 'source-exit-0');
      push('scenario.marker', it.at, { label: `Source exits ${Math.round(cfg.sourceExit.fraction * 100)}% of position — source-exit overlap`, severity: 'critical' }, 'marker-exit');
    } else if (it.kind === 'quote') {
      for (const size of cfg.quotes.sizesUsd) {
        const q = pool.quoteBuy(size);
        const noise = 1 + (rng() - 0.5) * 2 * cfg.quotes.noise;
        const ratio = (q.avgPrice / sourcePrice) * noise;
        const impactPct = (q.avgPrice / pool.price - 1) * 100;
        push('quote.observed', it.at, {
          chainId: cfg.chainId, tokenIn: cfg.quoteToken.address, tokenOut: cfg.token.address, delayMs: it.at, sizeUsd: size,
          amountOutUsd: size / ratio, effectivePriceRatio: ratio, priceImpactPct: impactPct, slippagePct: Math.min(3, impactPct * 1.4 + 0.1),
          feesUsd: cfg.sourceFeesUsd, latencyMs: Math.round(28 + rng() * 40), quotedAt: it.at, source: 'quoting-wss', quoteRef: `q-${quoteSeq}`,
        }, `quote-${quoteSeq++}`);
      }
    }
  }
  push('scenario.marker', 20_000, { label: 'Execution deteriorating: quotes drift above source price', severity: 'warning' }, 'marker-deteriorating');
  push('stream.status', cfg.durationMs, { provider: 'replay', state: 'ended', speed: cfg.defaultSpeed, message: 'Replay complete' }, 'status-end');
  events.sort((a, b) => a.at - b.at || a.seq - b.seq);
  events.forEach((e, i) => { e.seq = i; });

  const file = ReplayFile.parse({
    manifest: {
      v: 1,
      id: 'demo-crowd-capture.v1',
      title: 'Crowd capture on a +186% wallet',
      description: 'Synthetic demo of a profitable source trade that becomes unprofitable to follow as competing flow enters and the source exits.',
      provenance: prov,
      durationMs: cfg.durationMs,
      defaultSpeed: cfg.defaultSpeed,
      eventCount: events.length,
      generator: { name: 'data/replays/src/generate.ts', version: '1', seed: cfg.seed },
      disclosure: 'Demo scenario. All events are synthetic and generated from a constant-product pool simulation. Nothing here was captured from Mobula or any live market.',
      createdAt: '2026-09-04T12:00:00.000Z',
    },
    events,
  });
  return file;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const file = generateDemo();
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'demo-crowd-capture.v1.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(file, null, 1));
  console.log(`wrote ${out} (${file.events.length} events)`);
}
