# Start Here

Second Order is an Alpha Crash Test for copy-trading.

At a high level:

1. the stream service anchors on a source wallet's trade and collects what happened around it from Mobula: competing flow, the price path, depth, security
2. the browser reduces those events into a capacity surface, `C(delay, crowd AUM)`
3. CrowdGuard compares your intended size and delay against the surface and returns ALLOW, RESIZE or BLOCK, in the browser, without sending your intent anywhere

## What you drive

The utility is a setup-utility page. Items on the left, help on the right, a recorder below, a key legend at the bottom.

| Key | Does |
|---|---|
| ↑ ↓ | select an item |
| + − | change a value |
| ⏎ | edit a value inline |
| F2 | switch between MAIN and TARGET WALLET |
| F5 | run the crash test (or run again) |
| F6 | reconstruct the target wallet from Mobula history |
| F8 | block / unblock the source wallet in this browser |
| F9 | Evidence Log |
| F10 | shareable report |
| ESC ESC | reset |

Every key is also a button.

## Three provenance states

- **DEMO SCENARIO**: a synthetic, calibrated fixture. It tells the story cleanly and says so.
- **ESTIMATED RECONSTRUCTION**: real Mobula history, fetched after the fact; quotes inferred from the price path and current depth.
- **LIVE WITNESSED**: captured from Mobula streams while it happened. Needs a Growth-plan key.

## Choose your path

- If you want to see the story in fifteen seconds, read the [Walkthrough](./demo/walkthrough.md).
- If you want to test a wallet you care about, read [Real Wallets](./demo/real-wallets.md).
- If you want the model, read [The Capacity Surface](./concepts/capacity-surface.md) and then `packages/core/README.md`.
- If you want to build on the events, read the [Stream API](./stream-api.md).
