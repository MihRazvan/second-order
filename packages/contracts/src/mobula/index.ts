/**
 * Validators for the Mobula payloads we consume. Field names follow the official docs
 * reviewed on 2026-09-04 (docs.mobula.io). Only fields we use are required; everything
 * else is passed through so a doc change does not break ingestion.
 */
import { z } from 'zod';

const loose = <T extends z.ZodRawShape>(shape: T) => z.object(shape).loose();

export const MobulaTokenRef = loose({
  address: z.string(),
  name: z.string().nullable().optional(),
  symbol: z.string().nullable().optional(),
  logo: z.string().nullable().optional(),
  decimals: z.number().nullable().optional(),
});

/** GET /api/2/wallet/trades — one item of `data[]`. */
export const WalletTradeV2 = loose({
  id: z.string(),
  type: z.enum(['buy', 'sell']),
  operation: z.string().nullable().optional(),
  baseTokenAmount: z.number().nullable().optional(),
  baseTokenAmountUSD: z.number().nullable().optional(),
  quoteTokenAmountUSD: z.number().nullable().optional(),
  baseTokenPriceUSD: z.number().nullable().optional(),
  quoteTokenPriceUSD: z.number().nullable().optional(),
  date: z.number(),
  blockchain: z.string(),
  transactionHash: z.string(),
  marketAddress: z.string().nullable().optional(),
  transactionSenderAddress: z.string().nullable().optional(),
  swapSenderAddress: z.string().nullable().optional(),
  swapRecipient: z.string().nullable().optional(),
  baseToken: MobulaTokenRef.nullable().optional(),
  quoteToken: MobulaTokenRef.nullable().optional(),
  labels: z.array(z.string()).nullable().optional(),
  platform: loose({ id: z.union([z.string(), z.number()]).optional(), name: z.string().optional() }).nullable().optional(),
  totalFeesUSD: z.number().nullable().optional(),
  gasFeesUSD: z.number().nullable().optional(),
  platformFeesUSD: z.number().nullable().optional(),
});
export const WalletTradesV2Response = loose({
  data: z.array(WalletTradeV2),
  pagination: loose({ page: z.number(), offset: z.number(), limit: z.number(), pageEntries: z.number() }).optional(),
});

/** GET /api/2/token/trades — one item of `data[]`. Same shape as wallet trades v2 but `type` also carries deposit/withdrawal. */
export const TokenTrade = WalletTradeV2.extend({ type: z.string() });
export const TokenTradesResponse = loose({
  data: z.array(TokenTrade),
  pagination: loose({ page: z.number().optional(), offset: z.number().optional(), limit: z.number().optional(), pageEntries: z.number().optional() }).optional(),
});

/** GET /api/2/market/ohlcv-history — abbreviated candle fields, timestamps in ms. */
export const OhlcvCandle = loose({ t: z.number(), o: z.number(), h: z.number(), l: z.number(), c: z.number(), v: z.number().nullable().optional() });
export const OhlcvHistoryResponse = loose({ data: z.array(OhlcvCandle) });

/** GET /api/2/token/price-at */
export const TokenPriceAtResponse = loose({ data: loose({ priceUSD: z.number(), timestamp: z.number().optional(), swapTimestamp: z.number().nullable().optional(), poolAddress: z.string().nullable().optional() }) });

/** GET /api/2/wallet/analysis */
export const WalletAnalysisResponse = loose({
  data: loose({
    stat: loose({
      totalValue: z.number().nullable().optional(),
      periodTotalPnlUSD: z.number().nullable().optional(),
      periodRealizedPnlUSD: z.number().nullable().optional(),
      periodRealizedRate: z.number().nullable().optional(),
      periodActiveTokensCount: z.number().nullable().optional(),
      periodWinCount: z.number().nullable().optional(),
      periodBuys: z.number().nullable().optional(),
      periodSells: z.number().nullable().optional(),
      winRealizedPnlRate: z.number().nullable().optional(),
    }).optional(),
    labels: z.array(z.string()).nullable().optional(),
    walletMetadata: loose({ entityName: z.string().nullable().optional() }).nullable().optional(),
  }),
});

/** Quoting WebSocket frame (type: "quoting"). */
export const QuotingFrame = loose({
  type: z.literal('quoting'),
  subscriptionId: z.string().optional(),
  event: z.string().optional(),
  quoteTrigger: z.enum(['initial', 'interval', 'swap']).optional(),
  quoteSequence: z.number().optional(),
  requestId: z.string().optional(),
  chainId: z.string().optional(),
  tokenInAddress: z.string().optional(),
  tokenOutAddress: z.string().optional(),
  amountOutTokens: z.union([z.string(), z.number()]).optional(),
  slippagePercentage: z.number().nullable().optional(),
  marketImpactPercentage: z.number().nullable().optional(),
  amountInUSD: z.number().nullable().optional(),
  amountOutUSD: z.number().nullable().optional(),
  latencyMs: z.number().nullable().optional(),
  timestamp: z.number().optional(),
  error: z.unknown().optional(),
});

/** GET /api/2/swap/quoting */
export const SwapQuotingResponse = loose({
  data: loose({
    estimatedAmountOut: z.union([z.string(), z.number()]).nullable().optional(),
    estimatedSlippage: z.number().nullable().optional(),
    requestId: z.string().optional(),
  }).optional(),
  error: z.string().optional(),
});

/** Fast trades WebSocket frame (type: "fast-trade", assetMode true or false). */
export const FastTradeFrame = loose({
  pair: z.string().optional(),
  token: z.string().optional(),
  date: z.number(),
  tokenPrice: z.number().nullable().optional(),
  tokenAmount: z.number().nullable().optional(),
  tokenAmountUsd: z.number().nullable().optional(),
  type: z.enum(['buy', 'sell']),
  operation: z.string().optional(),
  blockchain: z.string().optional(),
  hash: z.string(),
  sender: z.string().nullable().optional(),
  labels: z.array(z.string()).nullable().optional(),
});

/** Enriched swap events frame (Multi-Events envelope, data.type === 'swap-enriched'). */
export const EnrichedSwapFrame = loose({
  data: loose({
    type: z.literal('swap-enriched'),
    poolAddress: z.string().optional(),
    poolType: z.string().optional(),
    transactionHash: z.string(),
    baseToken: z.string().optional(),
    quoteToken: z.string().optional(),
    baseTokenData: loose({ symbol: z.string().optional(), name: z.string().optional(), priceUSD: z.number().optional() }).optional(),
    swapSenderAddress: z.string().optional(),
    swapRecipient: z.string().nullable().optional(),
    date: z.string(),
  }),
  chainId: z.string(),
  duplicateCount: z.number().optional(),
  subscriptionId: z.string().optional(),
});

/** GET /api/2/token/security */
export const TokenSecurityResponse = loose({
  data: loose({
    address: z.string(),
    chainId: z.string(),
    buyFeePercentage: z.number().nullable().optional(),
    sellFeePercentage: z.number().nullable().optional(),
    transferFeePercentage: z.number().nullable().optional(),
    isMintable: z.boolean().nullable().optional(),
    isFreezable: z.boolean().nullable().optional(),
    transferPausable: z.boolean().nullable().optional(),
    isBlacklisted: z.boolean().nullable().optional(),
    isHoneypot: z.boolean().nullable().optional(),
    renounced: z.boolean().nullable().optional(),
    locked: z.string().nullable().optional(),
    balanceMutable: z.boolean().nullable().optional(),
    modifyableTax: z.boolean().nullable().optional(),
    selfDestruct: z.boolean().nullable().optional(),
    top10HoldingsPercentage: z.number().nullable().optional(),
    staticAnalysisStatus: z.string().nullable().optional(),
    liquidityBurnPercentage: z.number().nullable().optional(),
  }),
});

/** GET /api/2/market/details (pool query) */
export const MarketDetailsResponse = loose({
  data: loose({
    address: z.string(),
    blockchain: z.string().optional(),
    type: z.string().nullable().optional(),
    exchange: loose({ name: z.string().optional() }).nullable().optional(),
    priceUSD: z.number(),
    liquidityUSD: z.number().nullable().optional(),
    volume1hUSD: z.number().nullable().optional(),
    volume24hUSD: z.number().nullable().optional(),
    priceChange1hPercentage: z.number().nullable().optional(),
    latestTradeDate: z.string().nullable().optional(),
    base: loose({ address: z.string(), chainId: z.string().optional(), symbol: z.string().optional(), name: z.string().optional(), decimals: z.number().optional() }).optional(),
  }),
});

export type WalletTradeV2 = z.infer<typeof WalletTradeV2>;
export type OhlcvCandle = z.infer<typeof OhlcvCandle>;
export type QuotingFrame = z.infer<typeof QuotingFrame>;
export type FastTradeFrame = z.infer<typeof FastTradeFrame>;
export type EnrichedSwapFrame = z.infer<typeof EnrichedSwapFrame>;
