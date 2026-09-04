# Second Order — Project Brief

> For the reader with zero prior context: this document is the full briefing. It covers the problem, the mechanism, the architecture, the model, the data, the demo, the honest limits and the build history. The code is the source of truth; this is the map.

---

## TL;DR

Second Order is an **Alpha Crash Test** for copy-trading. Given a source wallet's trade, it estimates what a *follower* would receive after delay, size, competing same-direction flow, thinning execution depth and the source's own exit are priced in, and it turns that into a private pre-trade verdict: **ALLOW, RESIZE or BLOCK**.

The central object is the **Alpha Capacity Surface**, `C(delay, crowd AUM)`: the maximum aggregate follower capital for which the trade's scenario-adjusted follower expected value remains positive.

It is built on Mobula data (wallet trades, wallet analysis, pool trade history, 5-second candles, market details, token security; quoting and fast-trade streams on Growth plans), a pure TypeScript model with property tests, a Fastify stream service with PostgreSQL, and a Next.js utility styled as a BIOS setup screen with Win95 dialogs.

Live: https://second-order-crash-test.vercel.app · Stream: https://stream-production-900a.up.railway.app/health

---

## Table of Contents

1. [The Problem](#the-problem)
2. [Why This Matters](#why-this-matters)
3. [What Exists Today](#what-exists-today)
4. [Our Approach](#our-approach)
5. [The Model](#the-model)
6. [Architecture](#architecture)
7. [Data and Provenance](#data-and-provenance)
8. [The Utility](#the-utility)
9. [Demo Plan](#demo-plan)
10. [Honest Limits](#honest-limits)
11. [Repository Structure](#repository-structure)
12. [Build History](#build-history)
13. [What Comes Next](#what-comes-next)

---

## The Problem

Copy-trading is sold on the source's numbers. Leaderboards, Telegram calls and wallet trackers show realized PnL and win rate for a wallet, and the implied promise is that following it captures that return.

The follower is a different economic agent:

- They enter **late**. Alerts, signing and inclusion put them seconds behind, and in a thin pool seconds are the whole edge.
- They enter **behind a crowd**. Everyone acting on the same signal moves the price before the last of them fills.
- They **pay impact twice**: on entry, into a pool the crowd already pushed, and on exit, into a pool the source has already sold into.
- They exit **after the source**. A source that sells 55% of its position while followers are still holding leaves them the residual depth.
- They may be buying a **token that cannot be sold**. Honeypots and 100% sell taxes are common in exactly the small-cap pools where leaderboard returns come from.

None of this is visible from the source's PnL. The question "how much follower capital can this trade absorb before following it stops being profitable?" has no answer in today's tools.

## Why This Matters

The gap between source return and follower return is not a rounding error. In the calibrated demo scenario, a wallet with +186% realized over ninety days makes a trade for which a $1,000 copy at a five-second delay has an estimated outcome of −12.4%, and the maximum scenario-compatible size is $84. In a real reconstruction captured during the build, a Base wallet's latest buy turned out to be a fake CBBTC honeypot with a 100% sell tax; the wallet itself dumped 86% four minutes later.

Copy-trading volume is growing on every chain Mobula covers. A pre-trade check that prices the follower, with provenance, is missing infrastructure.

## What Exists Today

- **Wallet trackers and leaderboards** (Mobula's own wallet analysis, Nansen-style smart-money labels, DEX terminals) rank by source return. They answer "who is good?", not "how much of their edge survives being followed?".
- **Copy-trading bots** execute follows; some offer slippage caps. None estimates capacity or exit overlap.
- **Token security scanners** flag honeypots and taxes but say nothing about crowding or delay.

Second Order composes these observations into a follower-side estimate and a decision. It does not replace the data providers; it is what a wallet tracker should show next to the return.

## Our Approach

1. **Anchor** on a source trade: the tracked wallet's buy, its execution price, size, pool and fees.
2. **Observe** what happened around it: quotes on the same route at several delays and sizes, same-direction trades by other wallets, the price path, depth, security.
3. **Reduce** those observations, in the browser, into model inputs with an explicit data-quality report.
4. **Solve** `C(delay)` at the user's delay and evaluate the user's size.
5. **Decide** ALLOW / RESIZE / BLOCK, fail-conservative, with reasons.
6. **Show** the whole run as a recorder: followers boarding, capacity draining, depth thinning, the source exit, the verdict.

Three properties are non-negotiable:

- **Provenance is explicit.** Every event is DEMO SCENARIO, ESTIMATED RECONSTRUCTION or LIVE WITNESSED, and the utility never upgrades a label.
- **Intent stays local.** Size, delay and policy never leave the browser.
- **Nothing pretends.** Sampled scenarios are not followers, same-direction trades are not proof of copying, an exit overlap is not intent.

## The Model

The full assumptions are in `packages/core/README.md`. In brief:

**Entry.** Observed quotes over (delay, size) become a continuous entry-price function (linear in delay, log in size). A follower of size `S` behind flow `A` pays the average price over `[A, A+S]`. Beyond the observed envelope, a constant-product term calibrated to the largest observation is used and marked *extrapolated*; without quotes, a constant-product model on reported liquidity is used and marked *model*.

**Exit.** The target is the source's typical gain while the source still holds; once an exit is witnessed it becomes the current observed spot, so no further upside is assumed after the source has left. The source's unsold remainder is sold first. Exit depth is the lower of reported pool depth and the depth implied by the latest quotes.

**Costs.** Taxes from the security snapshot, a proportional platform fee per side, fixed gas per side.

**EV.** `exit · (1 − sellTax)(1 − buyTax)(1 − platformFee)² / entry − 1 − 2·gas / S`.

**Capacity.** EV rises then falls in size. Golden-section search finds the peak; if it is non-negative, bisection finds the upper root, which is `C`. `C = 0` when nothing survives.

**Verdict.** ALLOW if `S ≤ C` (or EV ≥ the policy threshold) and every input is fresh and complete. RESIZE if some smaller size survives. BLOCK if none does, or on `isHoneypot`, `balanceMutable` or `selfDestruct`.

**Tests.** 32 unit and property tests on the core: monotonicity of EV in size and in flow ahead, capacity tightness, capacity never increasing with thinner depth or higher fees, no ALLOW on stale quotes, a stale stream, missing snapshots or critical flags.

## Architecture

```
Browser (Next.js)                              Stream service (Fastify)                 Mobula
─────────────────────                          ─────────────────────────                ──────
intent (localStorage) ─┐                        DataSource interface
                       ▼                          ├─ ReplayDataSource   ◀── data/replays
ScenarioStore ◀── SSE ◀────────────────────────── │  (bundled + captured fixtures)
   │               ▲                              ├─ ReconstructionDataSource ◀─ REST ─▶ wallet trades, analysis,
   │     browser replay fallback                  │   (any wallet, keyless demo API)      token trades, OHLCV,
   ▼               (same fixture)                 └─ MobulaDataSource  ◀─ REST+WSS ─▶     market, security, quoting,
core: deriveInputs → solveCapacity → crowdGuard     (live witnessed, Growth plan)         fast-trade
   ▼                                              EventBus → SSE fan-out
BIOS utility · Win95 dialogs · report                       → PostgreSQL (Drizzle)
```

- `packages/contracts`: Zod schemas, versioned `DomainEvent` envelope, Mobula raw validators.
- `packages/core`: the pure model, reducer, CrowdGuard, samplers. No React, no I/O.
- `data/replays`: seeded generator, calibrated demo fixture, two real reconstructions promoted to fixtures.
- `apps/stream`: providers, sessions, SSE, persistence, capture, health, capability probes.
- `apps/web`: the utility, the report route, e2e tests, inspection scripts.

Resilience: exponential backoff with jitter on WebSockets, ping/pong and stale detection, token-bucket rate limiting with Retry-After on 429, zod validation at every boundary, idempotent ingestion by event id, typed errors without stack traces, browser replay fallback when the service is unreachable, PostgreSQL rebuild of sessions after restarts.

## Data and Provenance

| Kind | Source | What is real | What is inferred |
|---|---|---|---|
| DEMO SCENARIO | seeded constant-product pool with concentrated-liquidity thinning | nothing | everything; calibrated so the reducer reproduces the brief's numbers from events alone |
| ESTIMATED RECONSTRUCTION | Mobula REST history: wallet trades, pool trades, 5-second candles, market details, security, analysis | trades, prices, depth (today's), security, analysis | quotes: spot × constant-product impact on current depth |
| LIVE WITNESSED | Mobula quoting + fast-trade WebSockets (Growth plan) plus REST context | everything observed while it happened | the exit scenario |

Mobula's keyless demo API serves REST history, so reconstructions run with no key at all. With the free-plan key used during the build, the REST endpoints are available and both streams report plan-gated; the utility therefore offers reconstruction and hides live mode.

## The Utility

A setup-utility page: navy field, cyan labels, bracketed values, a grey selection bar, an Item Specific Help column, block-glyph meters, a 5×20 shadow-follower cell grid, a capacity map with one bar per delay, and a function-key legend that is the real navigation. Decisions arrive as Win95 dialogs. Details in `DESIGN.md`.

Keys: ↑↓ select · +/− change · ⏎ edit · F2 page · F5 run · F6 reconstruct · F8 block · F9 evidence · F10 report · ESC ESC reset. Every key is also a button; the utility is fully usable by mouse and on a phone.

## Demo Plan

See `docs/DEMO_SCRIPT.md`. Act one: F5 on the demo scenario, fifteen seconds, the dialog. Act two: the real CBBTC honeypot replay, then any wallet a judge names via F2 / F6, then F10 to share the report.

## Honest Limits

- The demo scenario is synthetic. It is calibrated to the brief's numbers and labelled at every turn.
- Reconstructed quotes are inferred from the price path and today's depth, not observed. The label says so.
- Live witnessed mode is implemented and unit-tested against documented frames but has not run against Mobula streams: the available key is on the free plan.
- The exit target when a wallet's typical gain is unknown defaults to 25% and is named in the verdict's reasons.
- Security snapshots for fresh tokens often arrive with static analysis pending; the verdict then downgrades to RESIZE and says why.
- The stream service knows which wallet you test. Intent does not leave the browser; the wallet does.

## Repository Structure

```
apps/web            Next.js utility, report route, Playwright e2e, inspection scripts
apps/stream         Fastify service: providers, sessions, SSE, persistence, capture
packages/contracts  Zod schemas and Mobula validators
packages/core       Pure model, reducer, CrowdGuard, samplers, tests
packages/ui         Shared helpers
data/replays        Fixture generator, calibration search, bundled replays
docs/               Quickstart, demo script, references, learn section, assets, design exploration
PRODUCT.md ARCHITECTURE.md DECISIONS.md DESIGN.md IMPLEMENTATION_PLAN.md PROGRESS.md
```

## Build History

One day, 2026-09-04, in milestone-sized commits:

1. Planning docs, workspace, contracts, pure model with tests.
2. Seeded fixture generator; a numeric search calibrated the scenario to the brief's numbers, which forced two honest model changes: execution depth that thins as the price runs, and proportional platform fees with Base-like gas.
3. Fastify stream service with SSE, memory and PostgreSQL persistence.
4. Three design directions screenshotted and scored; the flight recorder shipped first.
5. Mobula adapters: REST client with rate limiting, reconnecting WebSocket, normalizers tested on documented frames, capability probes.
6. Discovery that Mobula's keyless demo API serves REST history → the Estimated reconstruction path, run on real Base wallets; two promoted to bundled replays.
7. Durable sessions, shareable reports, interactivity.
8. Railway (stream + Postgres) and Vercel deployments.
9. Redesign to the BIOS setup-utility world with Win95 dialogs; keyboard-first.
10. This documentation set.

## What Comes Next

- **Live witnessed sessions** on a Growth-plan key, and captured live replays.
- **Crowdproof**: a prospective trader-reputation credential earned only when a wallet's signals survive witnessed follower conditions.
- **Batch crash tests** for a leaderboard: follower capacity next to source return for every wallet on a page.
- **Better exit targets** from per-wallet realized distributions instead of a period rate.
