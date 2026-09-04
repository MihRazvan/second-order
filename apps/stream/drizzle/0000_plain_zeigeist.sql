CREATE TABLE "capacity_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"at" bigint NOT NULL,
	"delay_ms" double precision NOT NULL,
	"competing_flow_usd" double precision NOT NULL,
	"capacity_usd" double precision NOT NULL,
	"confidence" text NOT NULL,
	"degraded" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competing_flow_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"seq" integer NOT NULL,
	"at" bigint NOT NULL,
	"provenance_kind" text NOT NULL,
	"provenance_source" text NOT NULL,
	"endpoint" text,
	"payload" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"chain_id" text NOT NULL,
	"wallet" text NOT NULL,
	"tx_hash" text NOT NULL,
	"side" text NOT NULL,
	"size_usd" double precision NOT NULL,
	"delay_ms" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"seq" integer NOT NULL,
	"at" bigint NOT NULL,
	"provenance_kind" text NOT NULL,
	"provenance_source" text NOT NULL,
	"endpoint" text,
	"payload" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"chain_id" text NOT NULL,
	"pool_address" text NOT NULL,
	"liquidity_usd" double precision NOT NULL,
	"price_usd" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_errors" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text,
	"stage" text NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"raw_sample" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"seq" integer NOT NULL,
	"at" bigint NOT NULL,
	"provenance_kind" text NOT NULL,
	"provenance_source" text NOT NULL,
	"endpoint" text,
	"payload" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"chain_id" text NOT NULL,
	"delay_ms" double precision NOT NULL,
	"size_usd" double precision NOT NULL,
	"effective_price_ratio" double precision NOT NULL,
	"quote_ref" text,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replay_manifests" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"provenance_kind" text NOT NULL,
	"duration_ms" bigint NOT NULL,
	"event_count" integer NOT NULL,
	"disclosure" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"seq" integer NOT NULL,
	"at" bigint NOT NULL,
	"provenance_kind" text NOT NULL,
	"provenance_source" text NOT NULL,
	"endpoint" text,
	"payload" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"chain_id" text NOT NULL,
	"address" text NOT NULL,
	"completeness" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_trade_events" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"seq" integer NOT NULL,
	"at" bigint NOT NULL,
	"provenance_kind" text NOT NULL,
	"provenance_source" text NOT NULL,
	"endpoint" text,
	"payload" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"wallet" text NOT NULL,
	"chain_id" text,
	"tx_hash" text,
	"size_usd" double precision
);
--> statement-breakpoint
CREATE UNIQUE INDEX "competing_flow_tx_idx" ON "competing_flow_observations" USING btree ("session_id","tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "source_trade_tx_idx" ON "source_trade_events" USING btree ("session_id","tx_hash","kind");