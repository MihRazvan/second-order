# Provenance and Trust

Every event carries a `provenance.kind`. The utility shows it next to every group of numbers and never upgrades it.

| Kind | What it means | Source |
|---|---|---|
| `demo-scenario` | Synthetic fixture generated from a seeded pool simulation, calibrated to the founding brief's numbers | `data/replays/src/generate.ts` |
| `estimated-reconstruction` | Real trades, prices and context fetched from Mobula REST history after the fact; quotes inferred from the price path and current pool depth | `apps/stream/src/datasources/mobula/reconstruction.ts` |
| `live-witnessed` | Observations captured from Mobula streams while they happened | `apps/stream/src/datasources/mobula/index.ts` (Growth-plan key) |

## What Second Order never claims

- Simulated shadow followers are real followers.
- Same-direction trades prove copy-trading.
- A source exit overlapping follower exits proves malicious intent.
- Scenario estimates guarantee returns.
- Historical reconstruction equals live witnessing.
- The system is completely private or trustless.

## What stays in your browser

Your intended size, delay assumption, additional-crowd assumption, policy thresholds and blocked-wallet list live in `localStorage`. They are not included in any request. The stream service computes only a reference snapshot at a fixed delay and size for persistence and evidence.

What the stream service does see: which wallet you are testing, and when.

## Trust model in one line

Trust Mobula's observations as observations; trust the model as a documented estimate; trust the label above every number to tell you which is which.
