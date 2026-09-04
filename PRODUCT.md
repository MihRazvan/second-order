# Product

<!-- impeccable:product-schema 1 -->

Second Order is an onchain **Alpha Crash Test**. It answers one question a copy-trader cannot answer from a leaderboard: *if I follow this wallet, what do I actually receive after delay, size, competing flow and the source's own exit are accounted for?*

> Provenance note: this record was written from the founding brief in an unattended session. Facts marked *(inferred)* were not confirmed by a human and should be corrected if wrong. Everything else is quoted or paraphrased from the brief.

## Platform

web

## Stack

delegated: pnpm workspace monorepo. `apps/web` is Next.js + React + TypeScript + Tailwind (semantic custom properties). `apps/stream` is Node.js + Fastify holding persistent Mobula WebSocket connections and exposing REST snapshots, health and an SSE feed. `packages/core` holds the pure capacity model. `packages/contracts` holds Zod schemas and versioned payload types. `packages/ui` holds project-owned primitives (Radix for behaviour only). `data/replays` holds versioned deterministic fixtures. PostgreSQL + Drizzle for persistence. Deployment target is one Railway project with separate `web` and `stream` services and Railway PostgreSQL. No Redis, Kafka, NATS, authentication, wallet execution or smart contracts in the first vertical slice.

## Users

Primary: a retail or semi-professional onchain trader who is about to copy a wallet they found on a leaderboard or a Telegram/Twitter call, sitting at a desktop with a swap interface open in another tab, deciding in under a minute whether to mirror a trade and at what size. Their job is to avoid becoming exit liquidity for a wallet whose profitability does not survive being followed.

Secondary *(inferred)*: hackathon judges and technical reviewers who need to verify that the numbers come from real observations and a documented model, not from a dashboard mock.

## Product Purpose

A profitable source wallet is not necessarily profitable to copy. When a tracked wallet trades, Second Order uses Mobula's wallet, trade, market, security and quoting infrastructure to estimate what followers would receive across different delays, order sizes and aggregate competing flow.

The central object is the **Alpha Capacity Surface**:

> C(delay, crowd AUM) = the maximum aggregate follower capital for which the trade's scenario-adjusted follower expected value remains positive.

Success means a user who was about to copy a trade that would lose them money is stopped, or resized, before they press swap, and can see the evidence for why.

## Positioning

Every copy-trading and wallet-tracking product ranks wallets by *their* realized return. Second Order is the only surface that prices the *follower's* return as a function of how late they are, how big they are, and how many others are doing the same thing, and then turns that surface into a pre-trade ALLOW / RESIZE / BLOCK decision. The mechanism a neighbouring product cannot truthfully copy is the capacity surface derived from live witnessed quotes and competing-flow observations rather than from the source's PnL.

## Operating Context

- The user arrives with a specific wallet in mind and, usually, a specific intended size. The decision is made in seconds, often while a pump is already under way.
- The three connected elements of the consumer experience are: the **Alpha Crash Test** (shadow-follower simulation entering the source trade at different delays and sizes), **Remaining Alpha** (a live capacity battery draining as competing same-direction flow enters), and **CrowdGuard** (a private pre-trade check comparing the user's intended size and delay against the capacity surface).
- The primary demo is a deterministic fifteen-second sequence that must read above the fold at 1440×900. It is labelled **Demo scenario** and must never be labelled "Live witnessed".
- Live mode depends on Mobula plan gating: the Quoting, Fast Trades and Enriched Swap streams are Growth/Enterprise-only. The product must detect what the current key can do and degrade explicitly.
- A later milestone may add **Crowdproof**, a prospective trader-reputation credential earned only when signals survive witnessed follower conditions. It is not prioritized before the main demo works.

## Capabilities and Constraints

Confirmed capabilities:

- Track a source wallet's swap trades (Mobula `GET /api/2/wallet/trades`, `GET /api/2/wallet/analysis` for historical performance context).
- Observe quotes for the same route at several delays and sizes (Mobula Quoting WebSocket `type: "quoting"` on `wss://api.mobula.io`, or `GET /api/2/swap/quoting` as REST fallback).
- Observe competing same-direction flow on the same token (Mobula Fast Trades stream `type: "fast-trade"` in asset mode, or Enriched Swap Events on `wss://stream-evm-prod.mobula.io` / `wss://stream-sol-prod.mobula.io`).
- Read token security state (Mobula `GET /api/2/token/security`) and market state (`GET /api/2/market/details`).
- Compute the capacity surface, remaining alpha and a CrowdGuard verdict as pure, unit-tested functions.
- Replay any captured or synthetic event sequence deterministically.

Binding constraints:

- The user's intended position size, delay assumptions and policy thresholds stay in the browser. They are not sent to the backend unless technically unavoidable and explicitly documented.
- Missing or stale data must never produce an ALLOW verdict.
- No Mobula API secrets in browser code.
- A sparse observed quote grid with interpolation is used; the product does not pretend to fire 100 real quote requests simultaneously. The 100 shadow followers are a visualization of sampled scenarios, not 100 network agents.

Terminology (use exactly):

- "shadow-follower simulation" — never "real followers"
- "competing flow" — same-direction trades; never "copy-traders" or "proof of copy-trading"
- "source-exit overlap" — never "rug", "dump on followers" or any claim of intent
- "scenario-adjusted outcome" — never "return", "profit" or "guaranteed"
- "estimated" — for anything reconstructed
- "live witnessed" — only for observations actually captured from Mobula in this process
- "maximum scenario-compatible size" — never "guaranteed safe size"
- "Demo scenario" — the label for every fixture

Truthfulness rules the product must never violate: simulated followers are not real followers; same-direction trades do not prove copy-trading; source-exit overlap does not prove malicious intent; scenario estimates do not guarantee returns; historical reconstruction is not equivalent to live witnessed quotes; the system is not completely private or trustless.

## Brand Commitments

Name: **Second Order**. Voice: precise, forensic, unhurried, never salesy; it reports evidence and states its own uncertainty. The brief binds one emotional register for the interface: an experimental financial crash-test laboratory or flight recorder communicating precision, controlled danger, forensic evidence, live market pressure and technical credibility. Semantic colour is binding: a distinctive high-visibility green for positive or available alpha, safety amber for warning and degrading capacity, controlled red for failed capacity or blocked action, cool off-white and desaturated technical tones for neutral evidence. No logo or wordmark exists yet.

## Evidence on Hand

- Demo fixture (synthetic, labelled "Demo scenario"): source wallet historical ROI +186%; Remaining Alpha starting at $14,200; user's proposed copy $1,000; final scenario outcome −12.4%; maximum scenario-compatible size $84. Stored under `data/replays/`.
- No live witnessed Mobula capture exists yet. Milestone 5 captures one. Until then the product must not claim one exists.
- Mobula documentation snapshots reviewed on 2026-09-04: wallet trades v2, wallet analysis, quoting stream, fast trades stream, enriched swap events stream, swap quoting REST, token security, market details, pricing/plan gating. Field names in `packages/contracts` follow those documents.
- No testimonials, customers, benchmarks or press. Do not fabricate them.

## Product Principles

1. **Price the follower, not the leader.** Every number on the primary surface describes what a follower would receive, never what the source made.
2. **Evidence before verdict.** A verdict is always one click away from the observations and assumptions that produced it.
3. **Fail conservative.** Stale, partial or missing data widens uncertainty and can only move a verdict toward RESIZE or BLOCK.
4. **Name the provenance.** Demo scenario, estimated reconstruction and live witnessed are visibly different states, everywhere they appear.
5. **Private by default.** What the user intends to trade is theirs; the model comes to the browser rather than the other way round.

## Accessibility & Inclusion

Keyboard-operable end to end with visible focus. `prefers-reduced-motion` must replace the swarm animation with a stepped, non-animated reveal that preserves the story. Colour is never the only carrier of the ALLOW / RESIZE / BLOCK state; each verdict has a label, a shape and a number. Contrast targets: body text ≥ 4.5:1, large numerals ≥ 3:1. Touch targets ≥ 44px on the 390px viewport.
