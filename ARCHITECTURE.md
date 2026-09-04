# Architecture

## System boundaries

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Browser (apps/web, Next.js)                                                 │
│                                                                              │
│   user-local state: intended size, delay assumption, policy thresholds ──┐   │
│                                                                          │   │
│   ScenarioStore  ◀── normalized DomainEvents ◀── SSE client ◀───────┐    │   │
│        │                       ▲                                    │    │   │
│        │            ReplayDataSource (browser fallback,             │    │   │
│        │            same fixture, same reducer)                     │    │   │
│        ▼                                                            │    │   │
│   @second-order/core  ── capacity surface, remaining alpha,         │    │   │
│                          CrowdGuard(intendedSize, delay, policy) ◀──┘    │   │
│        ▼                                                                 │   │
│   Crash Test UI · Remaining Alpha · CrowdGuard · Evidence drawer         │   │
└──────────────────────────────────────────────────────────────────────────────┘
                 ▲ HTTPS REST (snapshots, health)      ▲ SSE (events)
                 │                                     │
┌────────────────┴─────────────────────────────────────┴───────────────────────┐
│  apps/stream (Fastify)                                                       │
│                                                                              │
│   DataSource interface ──► ReplayDataSource   (data/replays/*.json)          │
│                        └─► MobulaDataSource   (REST + WSS adapters)          │
│                              ├─ capability detection per endpoint            │
│                              ├─ reconnect: exp backoff + jitter              │
│                              ├─ heartbeat + stale detection                  │
│                              └─ rate-limit + schema validation (zod)         │
│        │ normalized DomainEvents (idempotent by event id)                    │
│        ▼                                                                     │
│   EventBus ──► SSE fan-out to browsers                                       │
│           ──► Persistence (Drizzle → PostgreSQL, optional)                   │
│           ──► Derived capacity snapshots (core reducer, server copy)         │
└──────────────────────────────────────────────────────────────────────────────┘
                 │ Authorization: <MOBULA_API_KEY>  (server only)
                 ▼
          Mobula REST api.mobula.io · WSS api.mobula.io · stream-*-prod.mobula.io
```

The browser never talks to Mobula. The stream service never receives the user's intended size, delay assumption or policy thresholds: CrowdGuard runs in the browser against the capacity surface it derives locally from the same normalized events the server saw.

## Packages

| Package | Responsibility | Depends on |
|---|---|---|
| `packages/contracts` | Zod schemas for `DomainEvent` (versioned envelope), `Snapshot`, SSE frames, REST responses, Mobula raw payload validators | zod |
| `packages/core` | Pure functions: quote-grid interpolation, entry/exit price model, follower outcome, capacity solver, remaining alpha, CrowdGuard verdict, scenario reducer | contracts (types only) |
| `packages/replays` (`data/replays`) | Versioned JSON fixtures + manifest with provenance; generator script | contracts |
| `packages/ui` | Project-owned primitives (Button, Toggle, Slider, Drawer, Tooltip, NumberInput) built on Radix behaviour and the design tokens | react, radix |
| `apps/stream` | Fastify service: data sources, event bus, SSE, REST snapshot/health, Drizzle persistence | contracts, core, replays, fastify, drizzle, ws |
| `apps/web` | Next.js app: primary route, design-lab routes (temporary), evidence drawer, visualizations | contracts, core, replays, ui, d3 |

Dependency rule: `core` and `contracts` never import React, Node APIs, the database or the network. `apps/*` may import anything below them; packages never import from apps.

## Domain events (normalized)

Every provider emits the same `DomainEvent` envelope:

```ts
{
  v: 1,                          // payload schema version
  id: string,                    // globally unique, stable across replays → idempotency key
  seq: number,                   // monotonic within a session
  at: number,                    // event time (ms epoch, replay-relative for fixtures)
  sessionId: string,
  provenance: {
    kind: 'demo-scenario' | 'estimated-reconstruction' | 'live-witnessed',
    source: 'replay' | 'mobula-rest' | 'mobula-wss',
    capturedAt?: string,         // ISO, live/reconstruction only
    endpoint?: string            // e.g. 'quoting-wss', 'wallet-trades-v2'
  },
  type: ..., payload: ...        // discriminated union below
}
```

Event types:

- `source.trade` — the tracked wallet's swap (side, token, chain, size USD, execution price, tx hash). Mapped from wallet-trades v2 (`baseTokenAmountUSD`, `baseTokenPriceUSD`, `transactionHash`, `type`) or an enriched swap frame.
- `source.exit` — a later opposite-direction trade by the source in the same token (fraction of position, size USD). Same mapping.
- `source.profile` — historical performance context (`periodRealizedRate`, win distribution, labels) from wallet analysis.
- `quote.observed` — one quote on the follower route: `delayMs`, `sizeUsd`, `amountOutUsd`, `effectivePriceRatio`, `priceImpactPct`, `slippagePct`, `feesUsd`, `latencyMs`, `freshnessMs`. Mapped from quoting WSS (`amountInUSD`, `amountOutUSD`, `marketImpactPercentage`, `slippagePercentage`, `latencyMs`, `timestamp`) or swap quoting REST (`estimatedAmountOut`, `estimatedSlippage`).
- `flow.competing` — a same-direction trade by another wallet on the token after the source trade: `sizeUsd`, `delayMs`, `wallet`, `txHash`. Mapped from fast-trade frames (`tokenAmountUsd`, `type`, `sender`, `hash`, `date`).
- `security.snapshot` — subset of token security: `isHoneypot`, `buyFeePercentage`, `sellFeePercentage`, `isMintable`, `isFreezable`, `locked`, `liquidityBurnPercentage`, `top10HoldingsPercentage`, `staticAnalysisStatus`, `completeness`.
- `market.snapshot` — `liquidityUSD`, `priceUSD`, `volume1hUSD`, `priceChange1hPercentage`.
- `stream.status` — provider health: connected / reconnecting (attempt, nextRetryMs) / stale (lastMessageAgeMs) / degraded (capability list) / replay-fallback.

## Capacity model (see `packages/core/README.md` for the full assumptions)

1. **Quote grid.** Observed quotes form a sparse grid over (delay, size). Effective entry price ratio for a given (delay, aggregate size) is bilinear interpolation in (delay, log size). Outside the observed envelope the model extrapolates with a constant-product impact term calibrated to the largest observed sizes and marks confidence `extrapolated`.
2. **Entry.** A follower of size `s` entering at delay `d` behind aggregate competing flow `A` pays the average price over the interval `[A, A+s]` of the impact curve at delay `d`.
3. **Exit scenario.** The source's expected gross move (`edgePct`, from its profile and market state) sets the target. The follower exits into a pool that has already absorbed the source exit `S_exit` (source-exit overlap) plus the crowd's exit `A + s`, using the constant-product sell curve on observed liquidity.
4. **Costs.** Buy/sell taxes from the security snapshot, fixed gas + platform fees from observed trades, and slippage from quotes.
5. **Outcome.** `EV(d, s, A) = exitRatio · (1 − sellTax) / (entryRatio · (1 + buyTax)) − 1 − fixedFees / s`.
6. **Capacity.** `C(d, A) = max X ≥ 0 such that EV(d, X, A) ≥ 0`, solved by bisection (EV is monotone decreasing in X). **Remaining Alpha** at the user's delay is `C(d_user, A_now)`.
7. **CrowdGuard.** Runs in the browser. `ALLOW` if `EV(d, s, A) ≥ policy.minEvPct` and every input is fresh and complete. `RESIZE` if EV is negative but some `s* ≥ policy.minSizeUsd` satisfies EV ≥ 0; `s*` is the maximum scenario-compatible size. `BLOCK` if no such `s*` exists, if security flags are critical (`isHoneypot`, `balanceMutable`, `selfDestruct`), or if required inputs are stale/missing. Stale or missing inputs can never yield ALLOW.

The 100 shadow followers are 100 sampled `(delay, size)` scenarios drawn from the surface and re-evaluated as `A` grows. They are a visualization, not agents.

## Data sources

```ts
interface DataSource {
  readonly kind: 'replay' | 'mobula';
  start(session: SessionSpec): AsyncIterable<DomainEvent>;
  capabilities(): Promise<CapabilityReport>;   // which endpoints this key/plan can use
  stop(): Promise<void>;
}
```

`ReplayDataSource` reads a manifest + event file from `data/replays`, replays with the original relative timing (speed configurable), and stamps `provenance.kind` from the manifest. `MobulaDataSource` composes REST clients and WSS clients, normalizes with zod validators from `contracts/mobula`, deduplicates by tx hash / quote sequence, and emits `stream.status` events on every state transition. Capability detection probes each endpoint once at start and records `available | plan-gated | unreachable`.

## Persistence (PostgreSQL via Drizzle)

Tables: `source_trade_events`, `quote_observations`, `competing_flow_observations`, `security_snapshots`, `market_snapshots`, `capacity_snapshots` (derived), `replay_manifests`, `processing_errors`. All event tables have a unique index on the domain event `id` so ingestion is idempotent. Persistence is optional: without `DATABASE_URL` the stream service runs in memory and reports `persistence: 'memory'` in `/health`.

## Runtime and resilience

- WSS reconnect: exponential backoff `min(30s, 500ms · 2^n) + jitter(0..250ms)`, resets on a healthy message.
- Heartbeat: replies to `{event:"ping"}`; if no frame for `staleAfterMs` (default 10s for quoting, 30s for trades) emit `stream.status: stale`.
- Rate limits: token-bucket at the configured RPS; HTTP 429 → retry with `Retry-After` or backoff; surfaced as `degraded` status.
- Boundary validation: every inbound Mobula frame and every outbound SSE/REST payload is parsed with zod; failures are logged to `processing_errors` and never crash the process.
- Client never receives stack traces or secrets; errors are mapped to typed `ApiError { code, message }`.
- Browser replay fallback: if SSE cannot connect within 3s the web app loads the same fixture through the browser `ReplayDataSource` and labels the mode "Replay (local)".

## Deployment

One Railway project, two services (`web`, `stream`) and one Railway PostgreSQL. `stream` exposes `/health` (liveness) and `/ready` (readiness incl. provider state). `web` exposes `/api/health`. Restart policy on failure, max 10 retries. Secrets (`MOBULA_API_KEY`, `DATABASE_URL`) live only in Railway variables. Nothing is deployed without user approval.
