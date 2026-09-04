import { z } from 'zod';
import { Provenance } from './provenance';

export const EVENT_SCHEMA_VERSION = 1 as const;

export const ChainId = z.string().min(1); // e.g. "evm:8453", "solana:solana"
export const Address = z.string().min(1);
export const UsdAmount = z.number().finite().nonnegative();
export const Pct = z.number().finite();
export const Millis = z.number().finite();

export const TokenRef = z.object({
  address: Address,
  symbol: z.string(),
  name: z.string().optional(),
  decimals: z.number().int().nonnegative(),
  logo: z.string().url().optional(),
});
export type TokenRef = z.infer<typeof TokenRef>;

export const Side = z.enum(['buy', 'sell']);
export type Side = z.infer<typeof Side>;

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export const SourceTradePayload = z.object({
  wallet: Address,
  chainId: ChainId,
  token: TokenRef,
  quoteToken: TokenRef,
  side: Side,
  sizeUsd: UsdAmount,
  tokenAmount: z.number().finite().nonnegative(),
  executionPriceUsd: z.number().finite().positive(),
  txHash: z.string(),
  poolAddress: Address.optional(),
  platform: z.string().optional(),
  feesUsd: UsdAmount.nullable().optional(),
});

export const SourceExitPayload = z.object({
  wallet: Address,
  chainId: ChainId,
  token: TokenRef,
  sizeUsd: UsdAmount,
  /** Fraction of the position the source closed, 0..1. */
  fractionOfPosition: z.number().min(0).max(1),
  executionPriceUsd: z.number().finite().positive(),
  /** Realized price ratio vs the source entry (e.g. 1.38 = +38%). */
  priceRatioVsEntry: z.number().finite().positive(),
  txHash: z.string(),
  /** Milliseconds after the source trade. */
  delayMs: Millis,
});

export const SourceProfilePayload = z.object({
  wallet: Address,
  displayName: z.string().optional(),
  periodDays: z.number().int().positive(),
  /** Realized PnL rate for the period, percent (e.g. 186 = +186%). */
  realizedRatePct: Pct,
  realizedPnlUsd: z.number().finite(),
  winRatePct: Pct.nullable(),
  /** Typical realized gain on a winning trade, percent. Drives the exit target before a source exit is witnessed. */
  typicalGainPct: Pct.nullable(),
  tradeCount: z.number().int().nonnegative(),
  labels: z.array(z.string()).default([]),
  /** Number of chains the wallet traded on in the period. */
  chains: z.array(ChainId).default([]),
});

export const QuoteSource = z.enum(['quoting-wss', 'swap-quoting-rest', 'reconstruction']);

export const QuoteObservedPayload = z.object({
  chainId: ChainId,
  tokenIn: Address,
  tokenOut: Address,
  /** Milliseconds after the source trade at which the quote was observed. */
  delayMs: Millis,
  /** Notional of the quote request. */
  sizeUsd: UsdAmount,
  amountOutUsd: UsdAmount,
  /** Average execution price of this quote divided by the source execution price. >1 means worse than the source. */
  effectivePriceRatio: z.number().finite().positive(),
  priceImpactPct: Pct.nullable(),
  slippagePct: Pct.nullable(),
  feesUsd: UsdAmount.nullable(),
  latencyMs: Millis.nullable(),
  quotedAt: Millis,
  source: QuoteSource,
  /** Mobula quoteSequence / requestId when available; used for dedupe. */
  quoteRef: z.string().optional(),
});

export const CompetingFlowPayload = z.object({
  chainId: ChainId,
  token: TokenRef,
  wallet: Address,
  side: Side,
  sizeUsd: UsdAmount,
  /** Milliseconds after the source trade. */
  delayMs: Millis,
  txHash: z.string(),
  labels: z.array(z.string()).default([]),
});

export const StaticAnalysisStatus = z.enum(['completed', 'pending', 'not_available', 'insufficient_liquidity', 'not_evm']);

export const SecuritySnapshotPayload = z.object({
  chainId: ChainId,
  address: Address,
  isHoneypot: z.boolean().nullable(),
  buyFeePct: Pct.nullable(),
  sellFeePct: Pct.nullable(),
  transferFeePct: Pct.nullable(),
  isMintable: z.boolean().nullable(),
  isFreezable: z.boolean().nullable(),
  transferPausable: z.boolean().nullable(),
  balanceMutable: z.boolean().nullable(),
  selfDestruct: z.boolean().nullable(),
  isBlacklisted: z.boolean().nullable(),
  modifyableTax: z.boolean().nullable(),
  renounced: z.boolean().nullable(),
  /** LP locked share 0..1 (Mobula `locked` decimal string parsed). */
  lpLockedShare: z.number().min(0).max(1).nullable(),
  liquidityBurnPct: Pct.nullable(),
  top10HoldingsPct: Pct.nullable(),
  staticAnalysisStatus: StaticAnalysisStatus.nullable(),
  /** Share of the fields above that were non-null, 0..1. */
  completeness: z.number().min(0).max(1),
  observedAt: Millis,
});

export const MarketSnapshotPayload = z.object({
  chainId: ChainId,
  poolAddress: Address,
  poolType: z.string().nullable(),
  exchange: z.string().nullable(),
  priceUsd: z.number().finite().positive(),
  liquidityUsd: UsdAmount,
  volume1hUsd: UsdAmount.nullable(),
  volume24hUsd: UsdAmount.nullable(),
  priceChange1hPct: Pct.nullable(),
  latestTradeAt: Millis.nullable(),
  observedAt: Millis,
});

export const ProviderKind = z.enum(['replay', 'mobula']);
export const StreamState = z.enum(['connected', 'reconnecting', 'stale', 'degraded', 'replay-fallback', 'ended']);
export const CapabilityState = z.enum(['available', 'plan-gated', 'unreachable', 'unknown', 'disabled']);
export type CapabilityState = z.infer<typeof CapabilityState>;

export const StreamStatusPayload = z.object({
  provider: ProviderKind,
  state: StreamState,
  attempt: z.number().int().nonnegative().optional(),
  nextRetryMs: Millis.optional(),
  lastMessageAgeMs: Millis.optional(),
  capabilities: z.record(z.string(), CapabilityState).optional(),
  message: z.string().optional(),
  /** Replay speed factor when provider === 'replay'. */
  speed: z.number().positive().optional(),
});

export const ScenarioMarkerPayload = z.object({
  /** Short label shown on the timeline, e.g. "Source exits 60% of position". */
  label: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
});

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

const base = {
  v: z.literal(EVENT_SCHEMA_VERSION),
  id: z.string().min(1),
  seq: z.number().int().nonnegative(),
  /** Event time in ms. For fixtures this is relative to the fixture origin (source trade = 0). */
  at: Millis,
  sessionId: z.string().min(1),
  provenance: Provenance,
};

export const DomainEvent = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('source.trade'), payload: SourceTradePayload }),
  z.object({ ...base, type: z.literal('source.exit'), payload: SourceExitPayload }),
  z.object({ ...base, type: z.literal('source.profile'), payload: SourceProfilePayload }),
  z.object({ ...base, type: z.literal('quote.observed'), payload: QuoteObservedPayload }),
  z.object({ ...base, type: z.literal('flow.competing'), payload: CompetingFlowPayload }),
  z.object({ ...base, type: z.literal('security.snapshot'), payload: SecuritySnapshotPayload }),
  z.object({ ...base, type: z.literal('market.snapshot'), payload: MarketSnapshotPayload }),
  z.object({ ...base, type: z.literal('stream.status'), payload: StreamStatusPayload }),
  z.object({ ...base, type: z.literal('scenario.marker'), payload: ScenarioMarkerPayload }),
]);
export type DomainEvent = z.infer<typeof DomainEvent>;
export type DomainEventType = DomainEvent['type'];
export type DomainEventOf<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;

export type SourceTrade = z.infer<typeof SourceTradePayload>;
export type SourceExit = z.infer<typeof SourceExitPayload>;
export type SourceProfile = z.infer<typeof SourceProfilePayload>;
export type QuoteObserved = z.infer<typeof QuoteObservedPayload>;
export type CompetingFlow = z.infer<typeof CompetingFlowPayload>;
export type SecuritySnapshot = z.infer<typeof SecuritySnapshotPayload>;
export type MarketSnapshot = z.infer<typeof MarketSnapshotPayload>;
export type StreamStatus = z.infer<typeof StreamStatusPayload>;
export type ScenarioMarker = z.infer<typeof ScenarioMarkerPayload>;
