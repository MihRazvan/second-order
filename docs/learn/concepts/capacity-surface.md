# The Capacity Surface

> `C(delay, crowd AUM)` = the maximum aggregate follower capital for which the trade's scenario-adjusted follower expected value remains positive.

## Why a surface

A follower's outcome depends on two things the leaderboard hides: how late they are, and how much capital is trying to do the same thing. The surface makes both explicit. Slice it at your delay and you get a single number: how much can still enter with a positive scenario-adjusted outcome. That number is **Remaining Alpha**. Compare your size against it and you get **CrowdGuard**.

## The follower's outcome

For a follower of size `S` entering `D` seconds behind the source:

1. **Entry.** Observed quotes over (delay, size) form a sparse grid. The grid is interpolated (linear in delay, log in size) into a continuous entry-price function. The follower's slice of the impact curve is priced as the average over `[A, A+S]`, where `A` is the flow ahead of them that the quotes do not already reflect. Beyond the observed envelope, a constant-product term calibrated to the largest observation is used and marked `extrapolated`. Without quotes, a constant-product model on reported liquidity is used and marked `model`.
2. **Exit.** The target is the source's typical gain while the source still holds. Once a source exit is witnessed, the target becomes the current observed spot: no further upside is assumed after the source has left. The source's unsold remainder is sold before the follower; the follower's own exit impact comes on top. Exit depth is the lower of reported pool depth and the depth the latest quotes imply.
3. **Costs.** Buy and sell taxes from the security snapshot, a proportional platform fee per side, fixed gas per side.
4. **EV.** `exit · (1 − sellTax)(1 − buyTax)(1 − platformFee)² / entry − 1 − 2·gas / S`.

## Solving for C

EV rises with size at first (fixed costs stop dominating) and then falls (impact dominates). A golden-section search in log size finds the peak; if the peak is non-negative, a bisection finds the upper root. That root is `C`. If the peak is negative, `C` is zero and no size is scenario-compatible.

`C` is solved per delay for the capacity map, and at your delay for Remaining Alpha. The hypothetical **ADDITIONAL CROWD AUM** item adds capital ahead of you and re-solves.

## The hundred followers

The shadow-follower grid shows 100 sampled (delay, size) scenarios drawn from a stratified grid, re-evaluated against the same inputs as flow arrives. Each cell is coloured by its scenario-adjusted outcome. They are a picture of the surface, not agents and not wallets.

## What the model does not do

It does not predict prices. It does not know whether same-direction trades are copies. It does not infer intent from a source exit. It marks every quantity it did not observe.
