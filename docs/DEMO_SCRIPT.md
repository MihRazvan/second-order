# Demo script

Two acts, about a minute total. Everything below is driven with the keyboard; every key is also a button in the legend.

## Act one: the calibrated crash test (fifteen seconds)

Setup: open https://second-order-crash-test.vercel.app (or `pnpm dev` → http://localhost:3000) at 1440×900. The utility boots on `REPLAY [ CROWD CAPTURE ON A +186% WALLET ]`, provenance **DEMO SCENARIO**, `INTENDED SIZE [ $1,000 ]`, `FOLLOWER DELAY [ 5.0 SEC ]`, `REMAINING ALPHA $13,925`.

| Clock | On screen | Say |
|---|---|---|
| 0 s | Press **F5**. `CROWDGUARD VERDICT` spins `EVALUATING`. | "This wallet made 186%. Let's see what a follower gets." |
| 0–4 s | Shadow-follower cells fill green from the left; `COMPETING FLOW` grows; `REMAINING ALPHA` starts draining. | "A hundred sampled followers enter at different delays and sizes. Same-direction flow is already arriving." |
| 4–7 s | Cells past two seconds turn yellow, then red. `EXEC DEPTH` shrinks. Status line: *EXECUTION DETERIORATING*. | "Quotes drift above the source price and depth thins. Late followers are already losing." |
| ~7 s | Status line: *SOURCE EXITS 55% · SOURCE-EXIT OVERLAP*. `REMAINING ALPHA` collapses to red. | "The source sells while followers are still holding. That is overlap, not intent." |
| 15 s | Win95 dialog: **CrowdGuard — crowd capture risk · RESIZE — do not copy at $1,000 · −12.4% · max $84 · [Resize to $84] [Show evidence] [Share report] [Block wallet] [Copy anyway (disabled)] [OK]** | "CrowdGuard says: resize to 84 dollars, or block the wallet. Copy anyway is greyed out for a reason." |

Follow-ups: click **Resize to $84** (verdict flips to ALLOW), press **↓** to `FOLLOWER DELAY` and **+/−** (the capacity map re-solves instantly, in the browser), **F9** for the Evidence Log, **F10** for the shareable report.

## Act two: a real wallet (forty seconds)

1. Press **F2** to switch to the TARGET WALLET page, or use **+/−** on `REPLAY` to pick *REAL: FAKE CBBTC HONEYPOT ON BASE*. Say: "Now something we did not script."
2. **F5**. The recorder replays a real five-minute window reconstructed from Mobula history: 19 same-direction trades, the wallet's own 86% exit at T+250 s, and a **SECURITY BLOCK** because Mobula's static analysis flags the token as a honeypot with a 100% sell tax. Say: "Same model, real data, different failure mode."
3. Then paste any wallet a judge names on `TARGET WALLET` (⏎, paste, ⏎), pick the chain and window, press **F6**. Point at the header: *ESTIMATED RECONSTRUCTION*, not *LIVE WITNESSED*; quotes are inferred from the price path and current depth.
4. **F10** shares the report; size and delay live in the URL fragment only.

If the stream service is unreachable, `STREAM` reads *LOCAL REPLAY* and only the bundled demo runs.
