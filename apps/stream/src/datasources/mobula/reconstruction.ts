/**
 * Estimated reconstruction of a crash test from Mobula REST history.
 *
 * Given a wallet, anchor on one of its recent buys and rebuild the minutes after it:
 *  - competing flow and source exits from the pool's trade history (token trades, pair mode)
 *  - the price path from 5-second OHLCV candles → reconstructed quotes: spot × constant-product
 *    impact on the pool's reported depth (depth is today's, not the trade-time value)
 *  - wallet analysis, token security and market details as context snapshots
 *
 * Every event carries provenance `estimated-reconstruction`. Quotes are marked source
 * `reconstruction`: they were never observed, they are inferred from prices and depth.
 * Works against the keyless demo API (rate limited) and the production API alike.
 */
import type { DomainEvent, Provenance, TokenRef } from '@second-order/contracts';
import type { CapabilityReport, DataSource, SessionSpec } from '../types.js';
import { chainIdFromName, chainName, normalizeMarket, normalizeProfile, normalizeSecurity, normalizeSourceExit, normalizeSourceTrade, statusEvent, type NormalizeContext } from './normalize.js';
import { MobulaHttpError, type MobulaRest } from './rest.js';

const QUOTE_SIZES_USD = [100, 1000, 5000];
const DEFAULT_WINDOW_S = 300;
const TARGET_PLAYBACK_S = 15;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted || ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });

export interface ReconstructionResult {
  events: DomainEvent[];
  windowMs: number;
  notes: string[];
  source: Extract<DomainEvent, { type: 'source.trade' }>['payload'];
}

/** Pure-ish assembly: all REST calls happen here, ordering and provenance are deterministic. */
export async function reconstruct(rest: MobulaRest, spec: SessionSpec, signal: AbortSignal): Promise<ReconstructionResult> {
  if (!spec.wallet) throw Object.assign(new Error('wallet is required for a reconstruction'), { code: 'BAD_REQUEST', status: 400 });
  const windowMs = (spec.windowSeconds ?? DEFAULT_WINDOW_S) * 1000;
  const notes: string[] = [];

  const trades = await rest.walletTrades({ wallet: spec.wallet, blockchains: spec.chainId ? chainName(spec.chainId) : undefined, limit: 100 }, signal);
  // The chain filter is applied here as well (the keyless demo API ignores `blockchains`), and
  // only buys old enough to have a complete window behind them are eligible.
  const cutoff = Date.now() - windowMs;
  const buys = trades.data.filter((t) =>
    t.type === 'buy' && (t.baseTokenAmountUSD ?? 0) > 0 && t.marketAddress && t.date <= cutoff &&
    (!spec.chainId || chainIdFromName(t.blockchain) === spec.chainId));
  const buy = buys[spec.tradeIndex ?? 0];
  if (!buy) throw Object.assign(new Error(`No buy with a pool address at least ${windowMs / 1000}s old found for this wallet${spec.chainId ? ` on ${chainName(spec.chainId)}` : ''} (${buys.length} candidates)`), { code: 'NO_SOURCE_TRADE', status: 404 });

  const provenance: Provenance = { kind: 'estimated-reconstruction', source: 'mobula-rest' };
  let seq = 0;
  const ctx: NormalizeContext = { sessionId: spec.sessionId, provenance, originMs: buy.date, nextSeq: () => seq++ };
  const events: DomainEvent[] = [];
  const sourceEvent = normalizeSourceTrade(ctx, buy);
  (sourceEvent.payload as { wallet: string }).wallet = spec.wallet; // the tracked wallet, not a router
  const source = sourceEvent.payload as Extract<DomainEvent, { type: 'source.trade' }>['payload'];
  const chainId = source.chainId;
  const chain = chainName(chainId);
  const token: TokenRef = source.token;
  const pool = buy.marketAddress!;
  events.push(sourceEvent);
  events.push({ v: 1, id: `recon:marker:trade`, seq: seq++, at: 0, sessionId: spec.sessionId, provenance, type: 'scenario.marker', payload: { label: `Source BUY ${token.symbol} ${Math.round(source.sizeUsd)} USD (reconstructed)`, severity: 'info' } });

  // Context snapshots. Each is best effort; absence degrades the verdict in the browser.
  const [analysis, security, market, candles, poolTrades] = await Promise.all([
    rest.walletAnalysis({ wallet: spec.wallet, period: '90d' }, signal).then((a) => ({ ok: true as const, a })).catch((e: unknown) => ({ ok: false as const, e })),
    rest.tokenSecurity({ blockchain: chainId, address: token.address }, signal).then((s) => ({ ok: true as const, s })).catch((e: unknown) => ({ ok: false as const, e })),
    rest.marketDetails({ blockchain: chain, address: pool }, signal).then((m) => ({ ok: true as const, m })).catch((e: unknown) => ({ ok: false as const, e })),
    rest.ohlcvHistory({ chainId: chain, address: pool, period: '5s', from: buy.date - 5000, to: buy.date + windowMs, fill: true, amount: 2000 }, signal).then((c) => ({ ok: true as const, c })).catch((e: unknown) => ({ ok: false as const, e })),
    rest.tokenTrades({ blockchain: chain, address: pool, mode: 'pair', fromDate: buy.date, toDate: buy.date + windowMs, sortOrder: 'asc', limit: 1000 }, signal).then((t) => ({ ok: true as const, t })).catch((e: unknown) => ({ ok: false as const, e })),
  ]);
  const describe = (e: unknown) => (e instanceof MobulaHttpError ? `${e.status}${e.planGated ? ' plan-gated' : ''}` : (e as Error).message);

  if (analysis.ok) events.push(normalizeProfile(ctx, spec.wallet, analysis.a, 90)); else notes.push(`wallet analysis unavailable (${describe(analysis.e)})`);
  if (security.ok) events.push(normalizeSecurity(ctx, security.s, buy.date)); else notes.push(`token security unavailable (${describe(security.e)})`);

  let liquidityUsd = 0;
  if (market.ok) {
    const m = normalizeMarket(ctx, market.m, chainId, buy.date);
    const p = m.payload as Extract<DomainEvent, { type: 'market.snapshot' }>['payload'];
    liquidityUsd = p.liquidityUsd;
    // Price at the trade is the source execution; liquidity is today's reported figure.
    events.push({ ...m, payload: { ...p, priceUsd: source.executionPriceUsd, latestTradeAt: buy.date } } as DomainEvent);
    notes.push('pool liquidity is the current reported value, not the value at trade time');
  } else notes.push(`market details unavailable (${describe(market.e)}); liquidity unknown`);

  // Reconstructed quotes from the price path. Candle prices are the pool's own unit, which
  // need not match the wallet trade's base token price, so the path is taken relative to the
  // candle that contains the source trade rather than to the execution price.
  if (candles.ok && candles.c.data.length > 0 && liquidityUsd > 0 && source.executionPriceUsd > 0) {
    const Lq = liquidityUsd / 2;
    const sorted = [...candles.c.data].sort((a, b) => a.t - b.t);
    const anchor = sorted.find((k) => k.t <= buy.date && buy.date < k.t + 5000) ?? sorted.find((k) => k.t >= buy.date) ?? sorted[0]!;
    const p0 = anchor.c > 0 ? anchor.c : anchor.o;
    const unitMismatch = Math.abs(Math.log(p0 / source.executionPriceUsd)) > 0.35;
    if (unitMismatch) notes.push('pool candles are priced in a different unit than the wallet trade; price path taken relative to the trade-time candle');
    let n = 0;
    for (const k of sorted) {
      const at = k.t + 5000 - buy.date; // candle close
      if (at <= 0 || at > windowMs) continue;
      const spot = k.c / p0;
      if (!(spot > 0) || !Number.isFinite(spot)) continue;
      for (const sizeUsd of QUOTE_SIZES_USD) {
        events.push({
          v: 1, id: `recon:quote:${k.t}:${sizeUsd}`, seq: seq++, at, sessionId: spec.sessionId, provenance, type: 'quote.observed',
          payload: {
            chainId, tokenIn: source.quoteToken.address, tokenOut: token.address, delayMs: at, sizeUsd,
            amountOutUsd: sizeUsd / (spot * (1 + sizeUsd / Lq)), effectivePriceRatio: spot * (1 + sizeUsd / Lq),
            priceImpactPct: (sizeUsd / Lq) * 100, slippagePct: null, feesUsd: null, latencyMs: null, quotedAt: k.t + 5000, source: 'reconstruction', quoteRef: `ohlcv:${k.t}`,
          },
        });
      }
      n++;
    }
    notes.push(`${n} price points from 5s candles; impact reconstructed on current depth, not observed`);
  } else notes.push(candles.ok ? 'no candles in the window; entry prices are model-only' : `ohlcv unavailable (${describe(candles.e)})`);

  // Competing flow and source exits from the pool's trade history.
  if (poolTrades.ok) {
    const me = spec.wallet.toLowerCase();
    let flows = 0, exits = 0;
    for (const t of poolTrades.t.data) {
      if (t.transactionHash === buy.transactionHash) continue;
      const at = t.date - buy.date;
      if (at < 0 || at > windowMs) continue;
      const actors = [t.swapRecipient, t.swapSenderAddress, t.transactionSenderAddress].filter(Boolean).map((a) => a!.toLowerCase());
      const isSource = actors.includes(me);
      if (isSource) {
        if (t.type === 'sell') {
          events.push(normalizeSourceExit(ctx, { ...t, type: 'sell' }, { executionPriceUsd: source.executionPriceUsd, tokenAmount: source.tokenAmount, wallet: source.wallet, chainId, token }));
          if (exits === 0) events.push({ v: 1, id: `recon:marker:exit`, seq: seq++, at, sessionId: spec.sessionId, provenance, type: 'scenario.marker', payload: { label: `Source sells ${token.symbol} · source-exit overlap`, severity: 'critical' } });
          exits++;
        }
        continue;
      }
      if (t.type !== 'buy' && t.type !== 'sell') continue;
      const usd = t.baseTokenAmountUSD ?? t.quoteTokenAmountUSD;
      if (usd == null || usd <= 0) continue;
      events.push({
        v: 1, id: `recon:flow:${t.transactionHash}:${t.id}`, seq: seq++, at, sessionId: spec.sessionId, provenance, type: 'flow.competing',
        payload: { chainId, token, wallet: t.swapRecipient ?? t.swapSenderAddress ?? t.transactionSenderAddress ?? 'unknown', side: t.type as 'buy' | 'sell', sizeUsd: usd, delayMs: at, txHash: t.transactionHash, labels: t.labels ?? [] },
      });
      flows++;
    }
    notes.push(`${flows} trades by other wallets and ${exits} source sells in the ${windowMs / 1000}s window`);
    if (poolTrades.t.data.length >= 1000) notes.push('trade history truncated at 1000 rows');
  } else notes.push(`pool trade history unavailable (${describe(poolTrades.e)}); competing flow unknown`);

  events.sort((a, b) => a.at - b.at || a.seq - b.seq);
  events.forEach((e, i) => { e.seq = i; });
  return { events, windowMs, notes, source };
}

export function createReconstructionDataSource(rest: MobulaRest, restBaseUrl: string): DataSource {
  return {
    kind: 'mobula',
    provenanceKind: () => 'estimated-reconstruction',
    async capabilities(): Promise<CapabilityReport> {
      return { provider: 'mobula', capabilities: { 'wallet-trades-v2': 'unknown', 'token-trades': 'unknown', 'market-ohlcv-history': 'unknown', 'token-security': 'unknown', 'market-details': 'unknown', 'wallet-analysis': 'unknown' }, checkedAt: new Date().toISOString() };
    },
    async *start(spec, signal) {
      const speed = spec.speed ?? Math.max(1, Math.round(((spec.windowSeconds ?? DEFAULT_WINDOW_S)) / TARGET_PLAYBACK_S));
      const { events, windowMs, notes, source } = await reconstruct(rest, spec, signal);
      const ctx: NormalizeContext = { sessionId: spec.sessionId, provenance: { kind: 'estimated-reconstruction', source: 'mobula-rest' }, originMs: 0, nextSeq: () => 0 };
      const status = statusEvent(ctx, { provider: 'mobula', state: 'connected', speed, message: `Estimated reconstruction via ${new URL(restBaseUrl).host}: ${notes.join('; ')}` }, 0);
      yield { ...status, id: 'recon:status:start', seq: 0, at: 0 };
      const origin = Date.now();
      for (const e of events) {
        if (signal.aborted) return;
        await sleep(origin + e.at / speed - Date.now(), signal);
        if (signal.aborted) return;
        yield { ...e, seq: e.seq + 1 };
      }
      await sleep(origin + windowMs / speed - Date.now(), signal);
      yield { ...statusEvent(ctx, { provider: 'mobula', state: 'ended', speed, message: `Reconstruction window complete (${source.token.symbol})` }, windowMs), id: 'recon:status:end', seq: events.length + 1, at: windowMs };
    },
  };
}
