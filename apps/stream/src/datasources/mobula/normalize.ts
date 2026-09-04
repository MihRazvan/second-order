/**
 * Raw Mobula payloads → normalized DomainEvents. Pure functions; no I/O.
 * Ids are deterministic (derived from tx hashes / quote sequence) so ingestion is idempotent.
 */
import type { DomainEvent, Provenance, TokenRef } from '@second-order/contracts';
import type { z } from 'zod';
import type { FastTradeFrame, QuotingFrame, WalletTradeV2 } from '@second-order/contracts/mobula';
import { MarketDetailsResponse, TokenSecurityResponse, WalletAnalysisResponse } from '@second-order/contracts/mobula';

/** Mobula names chains in wallet endpoints; streams and security use chain ids. */
const CHAIN_IDS: Record<string, string> = {
  ethereum: 'evm:1', base: 'evm:8453', arbitrum: 'evm:42161', 'bnb smart chain (bep20)': 'evm:56', bnb: 'evm:56', bsc: 'evm:56',
  polygon: 'evm:137', optimism: 'evm:10', avalanche: 'evm:43114', solana: 'solana:solana',
};
export function chainIdFromName(name: string): string {
  const key = name.trim().toLowerCase();
  if (key.includes(':')) return key;
  return CHAIN_IDS[key] ?? key;
}

export interface NormalizeContext {
  sessionId: string;
  provenance: Provenance;
  /** Event-time origin (ms epoch of the source trade). Event `at` values are relative to it. */
  originMs: number;
  nextSeq: () => number;
}

const tokenRef = (t: { address: string; symbol?: string | null; name?: string | null; decimals?: number | null; logo?: string | null } | null | undefined, fallback: string): TokenRef => ({
  address: t?.address ?? fallback,
  symbol: t?.symbol ?? '?',
  name: t?.name ?? undefined,
  decimals: t?.decimals ?? 18,
});

function envelope<T extends DomainEvent['type']>(ctx: NormalizeContext, type: T, id: string, atMs: number, endpoint: string, payload: Extract<DomainEvent, { type: T }>['payload']): DomainEvent {
  return { v: 1, id, seq: ctx.nextSeq(), at: atMs - ctx.originMs, sessionId: ctx.sessionId, provenance: { ...ctx.provenance, endpoint, capturedAt: new Date().toISOString() }, type, payload } as DomainEvent;
}

/** A wallet trade by the tracked wallet: the anchoring source trade (buy) or a later exit (sell of the same token). */
export function normalizeSourceTrade(ctx: NormalizeContext, t: WalletTradeV2): DomainEvent {
  const chainId = chainIdFromName(t.blockchain);
  const base = tokenRef(t.baseToken, 'unknown');
  const quote = tokenRef(t.quoteToken, 'unknown');
  return envelope(ctx, 'source.trade', `mobula:trade:${t.transactionHash}`, t.date, 'wallet-trades-v2', {
    wallet: t.swapSenderAddress ?? t.transactionSenderAddress ?? 'unknown',
    chainId,
    token: base,
    quoteToken: quote,
    side: t.type,
    sizeUsd: t.baseTokenAmountUSD ?? t.quoteTokenAmountUSD ?? 0,
    tokenAmount: t.baseTokenAmount ?? 0,
    executionPriceUsd: (t.baseTokenPriceUSD ?? (t.baseTokenAmount && t.baseTokenAmountUSD ? t.baseTokenAmountUSD / t.baseTokenAmount : 0)) || 1e-12,
    txHash: t.transactionHash,
    poolAddress: t.marketAddress ?? undefined,
    platform: t.platform?.name ?? undefined,
    feesUsd: t.gasFeesUSD ?? t.totalFeesUSD ?? null,
    platformFeesUsd: t.platformFeesUSD ?? null,
    quoteTokenPriceUsd: t.quoteTokenPriceUSD ?? null,
  });
}

export function normalizeSourceExit(ctx: NormalizeContext, t: WalletTradeV2, entry: { executionPriceUsd: number; tokenAmount: number; wallet: string; chainId: string; token: TokenRef }): DomainEvent {
  const amount = t.baseTokenAmount ?? 0;
  const price = t.baseTokenPriceUSD ?? (amount && t.baseTokenAmountUSD ? t.baseTokenAmountUSD / amount : entry.executionPriceUsd);
  return envelope(ctx, 'source.exit', `mobula:exit:${t.transactionHash}`, t.date, 'wallet-trades-v2', {
    wallet: entry.wallet,
    chainId: entry.chainId,
    token: entry.token,
    sizeUsd: t.baseTokenAmountUSD ?? amount * price,
    fractionOfPosition: entry.tokenAmount > 0 ? Math.min(1, amount / entry.tokenAmount) : 1,
    executionPriceUsd: price,
    priceRatioVsEntry: entry.executionPriceUsd > 0 ? price / entry.executionPriceUsd : 1,
    txHash: t.transactionHash,
    delayMs: t.date - ctx.originMs,
  });
}

export function normalizeProfile(ctx: NormalizeContext, wallet: string, raw: z.infer<typeof WalletAnalysisResponse>, periodDays: number): DomainEvent {
  const stat = raw.data.stat ?? {};
  const buys = stat.periodBuys ?? 0;
  const sells = stat.periodSells ?? 0;
  return envelope(ctx, 'source.profile', `mobula:profile:${wallet}:${periodDays}`, ctx.originMs, 'wallet-analysis', {
    wallet,
    displayName: raw.data.walletMetadata?.entityName ?? undefined,
    periodDays,
    realizedRatePct: stat.periodRealizedRate ?? 0,
    realizedPnlUsd: stat.periodRealizedPnlUSD ?? 0,
    winRatePct: stat.winRealizedPnlRate ?? null,
    // Mobula does not expose a per-trade typical gain; it stays null and the model uses its documented default.
    typicalGainPct: null,
    tradeCount: buys + sells,
    labels: raw.data.labels ?? [],
    chains: [],
  });
}

export function normalizeQuote(ctx: NormalizeContext, f: QuotingFrame, sizeUsd: number, sourcePriceUsd: number): DomainEvent | null {
  if (f.error || f.amountOutUSD == null || f.amountInUSD == null || f.amountInUSD <= 0) return null;
  const quotedAt = f.timestamp ?? Date.now();
  // Effective price of this quote vs the source execution: USD paid per USD of tokens received at the source price.
  const tokensOut = Number(f.amountOutTokens);
  const effectivePriceRatio = tokensOut > 0 && sourcePriceUsd > 0 ? f.amountInUSD / (tokensOut * sourcePriceUsd) : f.amountInUSD / f.amountOutUSD;
  return envelope(ctx, 'quote.observed', `mobula:quote:${f.subscriptionId ?? 'sub'}:${f.quoteSequence ?? f.requestId ?? quotedAt}`, quotedAt, 'quoting-wss', {
    chainId: f.chainId ?? 'unknown',
    tokenIn: f.tokenInAddress ?? 'unknown',
    tokenOut: f.tokenOutAddress ?? 'unknown',
    delayMs: quotedAt - ctx.originMs,
    sizeUsd,
    amountOutUsd: f.amountOutUSD,
    effectivePriceRatio: Number.isFinite(effectivePriceRatio) && effectivePriceRatio > 0 ? effectivePriceRatio : f.amountInUSD / f.amountOutUSD,
    priceImpactPct: f.marketImpactPercentage ?? null,
    slippagePct: f.slippagePercentage ?? null,
    feesUsd: null,
    latencyMs: f.latencyMs ?? null,
    quotedAt,
    source: 'quoting-wss',
    quoteRef: f.requestId ?? undefined,
  });
}

export function normalizeRestQuote(ctx: NormalizeContext, p: { chainId: string; tokenIn: string; tokenOut: string; sizeUsd: number; amountOutTokens: number; estimatedSlippage: number | null; sourcePriceUsd: number; requestId?: string; quotedAt: number }): DomainEvent {
  const ratio = p.amountOutTokens > 0 && p.sourcePriceUsd > 0 ? p.sizeUsd / (p.amountOutTokens * p.sourcePriceUsd) : 1;
  return envelope(ctx, 'quote.observed', `mobula:restquote:${p.requestId ?? p.quotedAt}:${p.sizeUsd}`, p.quotedAt, 'swap-quoting-rest', {
    chainId: p.chainId, tokenIn: p.tokenIn, tokenOut: p.tokenOut, delayMs: p.quotedAt - ctx.originMs, sizeUsd: p.sizeUsd,
    amountOutUsd: p.amountOutTokens * p.sourcePriceUsd, effectivePriceRatio: ratio, priceImpactPct: null, slippagePct: p.estimatedSlippage, feesUsd: null,
    latencyMs: null, quotedAt: p.quotedAt, source: 'swap-quoting-rest', quoteRef: p.requestId,
  });
}

export function normalizeCompetingFlow(ctx: NormalizeContext, f: FastTradeFrame, token: TokenRef, chainId: string): DomainEvent | null {
  if (f.tokenAmountUsd == null || !f.sender) return null;
  return envelope(ctx, 'flow.competing', `mobula:flow:${f.hash}`, f.date, 'fast-trade-wss', {
    chainId,
    token,
    wallet: f.sender,
    side: f.type,
    sizeUsd: f.tokenAmountUsd,
    delayMs: f.date - ctx.originMs,
    txHash: f.hash,
    labels: f.labels ?? [],
  });
}

export function normalizeSecurity(ctx: NormalizeContext, raw: z.infer<typeof TokenSecurityResponse>, observedAt: number): DomainEvent {
  const d = raw.data;
  const fields = [d.isHoneypot, d.buyFeePercentage, d.sellFeePercentage, d.transferFeePercentage, d.isMintable, d.isFreezable, d.transferPausable, d.balanceMutable, d.selfDestruct, d.isBlacklisted, d.modifyableTax, d.renounced, d.locked, d.liquidityBurnPercentage, d.top10HoldingsPercentage, d.staticAnalysisStatus];
  const completeness = fields.filter((v) => v !== null && v !== undefined).length / fields.length;
  const locked = d.locked != null ? Number(d.locked) : null;
  const status = d.staticAnalysisStatus;
  const knownStatus = status && ['completed', 'pending', 'not_available', 'insufficient_liquidity', 'not_evm'].includes(status) ? (status as 'completed') : null;
  return envelope(ctx, 'security.snapshot', `mobula:security:${d.chainId}:${d.address}:${observedAt}`, observedAt, 'token-security', {
    chainId: d.chainId,
    address: d.address,
    isHoneypot: d.isHoneypot ?? null,
    buyFeePct: d.buyFeePercentage ?? null,
    sellFeePct: d.sellFeePercentage ?? null,
    transferFeePct: d.transferFeePercentage ?? null,
    isMintable: d.isMintable ?? null,
    isFreezable: d.isFreezable ?? null,
    transferPausable: d.transferPausable ?? null,
    balanceMutable: d.balanceMutable ?? null,
    selfDestruct: d.selfDestruct ?? null,
    isBlacklisted: d.isBlacklisted ?? null,
    modifyableTax: d.modifyableTax ?? null,
    renounced: d.renounced ?? null,
    lpLockedShare: locked !== null && Number.isFinite(locked) ? Math.min(1, Math.max(0, locked)) : null,
    liquidityBurnPct: d.liquidityBurnPercentage ?? null,
    top10HoldingsPct: d.top10HoldingsPercentage ?? null,
    staticAnalysisStatus: knownStatus,
    completeness,
    observedAt,
  });
}

export function normalizeMarket(ctx: NormalizeContext, raw: z.infer<typeof MarketDetailsResponse>, chainId: string, observedAt: number): DomainEvent {
  const d = raw.data;
  return envelope(ctx, 'market.snapshot', `mobula:market:${d.address}:${observedAt}`, observedAt, 'market-details', {
    chainId,
    poolAddress: d.address,
    poolType: d.type ?? null,
    exchange: d.exchange?.name ?? null,
    priceUsd: d.priceUSD,
    liquidityUsd: d.liquidityUSD ?? 0,
    volume1hUsd: d.volume1hUSD ?? null,
    volume24hUsd: d.volume24hUSD ?? null,
    priceChange1hPct: d.priceChange1hPercentage ?? null,
    latestTradeAt: d.latestTradeDate ? Date.parse(d.latestTradeDate) : null,
    observedAt,
  });
}

export function statusEvent(ctx: NormalizeContext, payload: Extract<DomainEvent, { type: 'stream.status' }>['payload'], atMs = Date.now()): DomainEvent {
  return envelope(ctx, 'stream.status', `mobula:status:${atMs}:${payload.state}`, atMs, 'stream', payload);
}
