import { bigint, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const base = {
  id: text('id').primaryKey(),               // domain event id → idempotent ingestion
  sessionId: text('session_id').notNull(),
  seq: integer('seq').notNull(),
  at: bigint('at', { mode: 'number' }).notNull(),
  provenanceKind: text('provenance_kind').notNull(),
  provenanceSource: text('provenance_source').notNull(),
  endpoint: text('endpoint'),
  payload: jsonb('payload').notNull(),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
};

export const sourceTradeEvents = pgTable('source_trade_events', {
  ...base,
  kind: text('kind').notNull(), // 'trade' | 'exit' | 'profile'
  wallet: text('wallet').notNull(),
  chainId: text('chain_id'),
  txHash: text('tx_hash'),
  sizeUsd: doublePrecision('size_usd'),
}, (t) => [uniqueIndex('source_trade_tx_idx').on(t.sessionId, t.txHash, t.kind)]);

export const quoteObservations = pgTable('quote_observations', {
  ...base,
  chainId: text('chain_id').notNull(),
  delayMs: doublePrecision('delay_ms').notNull(),
  sizeUsd: doublePrecision('size_usd').notNull(),
  effectivePriceRatio: doublePrecision('effective_price_ratio').notNull(),
  quoteRef: text('quote_ref'),
  source: text('source').notNull(),
});

export const competingFlowObservations = pgTable('competing_flow_observations', {
  ...base,
  chainId: text('chain_id').notNull(),
  wallet: text('wallet').notNull(),
  txHash: text('tx_hash').notNull(),
  side: text('side').notNull(),
  sizeUsd: doublePrecision('size_usd').notNull(),
  delayMs: doublePrecision('delay_ms').notNull(),
}, (t) => [uniqueIndex('competing_flow_tx_idx').on(t.sessionId, t.txHash)]);

export const securitySnapshots = pgTable('security_snapshots', {
  ...base,
  chainId: text('chain_id').notNull(),
  address: text('address').notNull(),
  completeness: doublePrecision('completeness').notNull(),
});

export const marketSnapshots = pgTable('market_snapshots', {
  ...base,
  chainId: text('chain_id').notNull(),
  poolAddress: text('pool_address').notNull(),
  liquidityUsd: doublePrecision('liquidity_usd').notNull(),
  priceUsd: doublePrecision('price_usd').notNull(),
});

export const capacitySnapshots = pgTable('capacity_snapshots', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  at: bigint('at', { mode: 'number' }).notNull(),
  delayMs: doublePrecision('delay_ms').notNull(),
  competingFlowUsd: doublePrecision('competing_flow_usd').notNull(),
  capacityUsd: doublePrecision('capacity_usd').notNull(),
  confidence: text('confidence').notNull(),
  degraded: integer('degraded').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const replayManifests = pgTable('replay_manifests', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  provenanceKind: text('provenance_kind').notNull(),
  durationMs: bigint('duration_ms', { mode: 'number' }).notNull(),
  eventCount: integer('event_count').notNull(),
  disclosure: text('disclosure').notNull(),
  manifest: jsonb('manifest').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const processingErrors = pgTable('processing_errors', {
  id: text('id').primaryKey(),
  sessionId: text('session_id'),
  stage: text('stage').notNull(),      // 'validate' | 'normalize' | 'persist' | 'ws'
  code: text('code').notNull(),
  message: text('message').notNull(),
  rawSample: jsonb('raw_sample'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
});
