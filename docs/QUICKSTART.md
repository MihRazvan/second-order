# Quickstart

The shortest path from a fresh clone to a running crash test, and from there to a real wallet.

## 1. Run it

```bash
corepack enable           # pnpm 10
pnpm install
pnpm dev                  # web http://localhost:3000 · stream http://localhost:4010
```

Open http://localhost:3000. The utility boots armed on the demo scenario. Press **F5**.

No key is required: without `MOBULA_API_KEY` the stream service talks to Mobula's keyless demo API for reconstructions.

## 2. Read the screen

| Item | Meaning |
|---|---|
| `SOURCE RETURN` | What the leaderboard shows: the tracked wallet's realized return. |
| `REMAINING ALPHA` | `C(delay, crowd)`: the largest additional order that still has a positive scenario-adjusted outcome at your delay. Drains during the run. |
| `FOLLOWER RETURN` | Scenario-adjusted outcome of *your* copy at your size and delay. |
| `CROWDGUARD VERDICT` | ALLOW · RESIZE · BLOCK. Delivered as a dialog when the recording ends. |
| `PROVENANCE` | DEMO SCENARIO · ESTIMATED RECONSTRUCTION · LIVE WITNESSED. Never confused. |

Keys: `↑↓` select · `+/−` change · `⏎` edit · `F2` page · `F5` run · `F6` reconstruct · `F8` block · `F9` evidence · `F10` report · `ESC` reset. Every key is also a button.

## 3. Crash-test a real wallet

1. Press **F2** to open the TARGET WALLET page.
2. On `TARGET WALLET` press **⏎**, paste an address, press **⏎**.
3. Choose `TARGET CHAIN` and `WINDOW` with **+/−**.
4. Press **F6**. The stream service anchors on the wallet's most recent buy that is at least one window old, pulls the pool's trade history, 5-second candles, security and market context from Mobula, and replays the reconstructed minutes in about fifteen seconds.

Two real reconstructions ship in the `REPLAY` item: a fake CBBTC honeypot on Base (SECURITY BLOCK) and a FLOCK buy that stays scenario-compatible.

## 4. Share it

After a run, **F10** opens `/report/<sessionId>`. Your size and delay travel only in the URL fragment. Reports are rebuilt from the session's events, which survive stream restarts when PostgreSQL is configured.

## 5. Optional: your own Mobula key and database

`apps/stream/.env`:

```bash
MOBULA_API_KEY=...                 # production API instead of the demo API
DATABASE_URL=postgres://...        # durable sessions and reports
CAPTURE_DIR=../../data/replays/captures   # save reconstructions as replays
```

With a Growth-plan key the quoting and fast-trade streams become available and the utility offers **live witnessed** sessions; on the free plan they are reported as plan-gated and live mode stays hidden.

## 6. Tests

```bash
pnpm test        # 55 unit tests: model, contracts, fixtures, stream, normalizers
pnpm test:e2e    # Playwright: the F5 flow, resize/block, evidence, keyboard, at three viewports
```
