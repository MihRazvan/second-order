# Real Wallets

## Bundled reconstructions

Use **+/−** on the `REPLAY` item.

- **Real: fake CBBTC honeypot on Base.** A real Base wallet bought a token named CBBTC in a $250k pool. Mobula's static analysis flags it as a honeypot with a 100% sell tax; the wallet sold 86% at T+250 s; 19 same-direction trades followed. Verdict: **SECURITY BLOCK**. Provenance: ESTIMATED RECONSTRUCTION.
- **Real: FLOCK buy on Base survives the crash test.** $44 buy, 109 same-direction trades in five minutes, pool depth $86k per side. A $1,000 copy stays **scenario-compatible**.

Both were captured on 2026-09-04 from Mobula REST history and promoted from `data/replays/captures/` into `data/replays/fixtures/`. Their manifests carry the disclosure.

## Your own wallet

1. **F2** to the TARGET WALLET page.
2. `TARGET WALLET`: **⏎**, paste an EVM or Solana address, **⏎**.
3. `TARGET CHAIN` and `WINDOW` with **+/−**. `WHICH BUY` picks an earlier eligible buy.
4. **F6**.

The stream service anchors on the wallet's most recent buy that is at least one window old (so the window is complete), then fetches from Mobula: the pool's trade history for competing flow and source exits, 5-second candles for the price path, market details for depth, token security for taxes and flags, wallet analysis for the leaderboard number. It replays the reconstructed window in about fifteen seconds and labels everything ESTIMATED RECONSTRUCTION.

Notes the reconstruction attaches, visible in the Evidence Log under provider capabilities: pool liquidity is today's reported value; candle prices are taken relative to the trade-time candle; competing-flow rows are truncated at 1000.

## Live witnessed

With a Growth-plan Mobula key in `apps/stream/.env`, the quoting and fast-trade WebSocket streams become available and the utility offers **live** sessions on the TARGET WALLET page. On the free plan they are reported as plan-gated and the option stays hidden.
