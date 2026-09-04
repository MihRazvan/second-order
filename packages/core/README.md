# @second-order/core

Pure, deterministic capacity model. No React, no network, no database.

## What it computes

| Function | Meaning |
|---|---|
| `buildQuoteGrid(quotes, {quoteLiquidityUsd})` | Turns sparse observed quotes over (delay, size) into a continuous entry-price function with explicit confidence. |
| `followerEntryRatio(grid, d, A, s)` | Average price ratio paid by a follower of size `s` entering at delay `d` behind `A` USD of same-direction flow. |
| `followerOutcome(inputs, d, s)` | Scenario-adjusted expected value of that follower, percent, with a breakdown. |
| `solveCapacity(inputs, d)` | **C(d, A)**: the largest additional order whose scenario-adjusted EV is still ≥ 0. |
| `reduceScenario(state, event)` | Idempotent reducer over normalized `DomainEvent`s. |
| `deriveInputs(state)` | Observations → model inputs + data-quality report. |
| `crowdGuard(state, intent, policy)` | ALLOW / RESIZE / BLOCK. Runs in the browser. |
| `sampleShadowFollowers()` / `evaluateShadowFollowers()` | 100 sampled scenarios for the swarm visualization. |
| `capacityCurve()` / `capacitySurface()` | Slices of C over delay and over (delay × crowd). |

## Model assumptions (all documented, all conservative)

1. **Entry price from quotes.** A quote for `X` USD at delay `d` gives an average price ratio `r(d, X)` vs the source execution. The follower's slice `[A, A+s]` pays `s / (Q(A+s) − Q(A))` with `Q(X) = X / r(d, X)`. Interpolation is linear in delay and in log size. Below the smallest observed size the smallest observation is held (never optimistic). Above the largest observed size a constant-product term calibrated to the largest observation is used and the result is marked `extrapolated`. Beyond the last observed delay the last curve is held and marked `projected`. Without quotes a constant-product model on reported liquidity is used and marked `model`.
2. **Competing flow ahead.** `A(d)` is the sum of same-direction trades by other wallets observed with delay ≤ d. Opposite-direction trades are ignored (they would help the follower; ignoring them is conservative).
3. **Exit scenario.** The target is the source's typical realized gain until a source exit is witnessed; then it is `min(typical, realized)`. The source is assumed to sell its whole position at the target unless observed otherwise (source-exit overlap assumed, then witnessed). Followers exit as a block *after* the source, into the depleted pool, using constant-product sell impact on quote-side liquidity (`liquidityUsd / 2`). This is the worst plausible ordering and is stated as such.
4. **Costs.** Buy/sell taxes from the security snapshot, a fixed per-order fee from the source trade (gas + platform) or a documented default.
5. **EV.** `EV = exit · (1 − sellTax)(1 − buyTax) / entry − 1 − fixedFees / size`.
6. **Capacity.** EV rises then falls in size (fixed fees dominate tiny orders, impact dominates large ones). The solver finds the peak by golden-section search; if the peak is ≥ 0 it bisects for the upper root. Capacity is `0` when no size is scenario-compatible.
7. **Fail conservative.** Missing or stale market, quotes or security data adds an issue to `DataQuality`; any issue downgrades ALLOW to RESIZE. Critical security flags (`isHoneypot`, `balanceMutable`, `selfDestruct`) BLOCK regardless of EV.

## Non-claims

The model estimates a scenario-adjusted outcome. It does not predict prices, does not know whether same-direction trades are copies, and does not infer intent from a source exit. Simulated followers are sampled scenarios, not agents.
