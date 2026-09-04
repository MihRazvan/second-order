# Fifteen-second demo script

Setup: `pnpm dev`, open http://localhost:3000 at 1440×900. The page loads armed: wallet `0x7c3f…b91e`, **+186%** realized over 90 days, Remaining Alpha **estimated $13,925** at a 5 s delay, your copy **$1,000**.

| Clock | What happens on screen | What to say |
|---|---|---|
| 0 s | Press **Crash test this wallet**. Annunciator turns amber: EVALUATING. Playhead starts. | "This wallet made 186%. Let's see what a follower gets." |
| 0–4 s | Shadow followers board along the time axis, green at first. Remaining Alpha area starts draining as competing-flow bars appear. | "A hundred sampled followers enter at different delays and sizes. Same-direction flow is already arriving." |
| 4–7 s | Followers past 2 s turn amber, then red. Execution-depth lane bends down. Event flag: *Execution deteriorating*. | "Quotes drift above the source price and depth thins. Late followers are already losing." |
| ~7 s | Red flag: *Source exits 55% · source-exit overlap*. Remaining Alpha collapses. | "The source sells while followers are still holding. That is overlap, not intent." |
| 7–15 s | Meter settles near **$84**. Readout for your copy reads **−12.4%**. | "Your $1,000 copy at five seconds would return about minus twelve percent." |
| 15 s | Annunciator flips red: **CROWD CAPTURE RISK · −12.4% · Max scenario-compatible size $84 · [Resize to $84] [Block wallet]**. | "CrowdGuard says: resize to 84 dollars, or block the wallet." |

Follow-ups for judges: press **Resize to $84** (verdict becomes ALLOW), move the delay slider (curve and verdict update instantly, in the browser), open **Open evidence** (provenance, model inputs, quote column, flow ledger, assumptions), add `?stream=off` to show the local replay fallback.

## Second act: a real wallet (about 40 seconds)

1. Scroll to **Crash test any wallet**. Say: "Now something we did not script."
2. Pick a replay first for determinism: in **Replays**, click *Real: fake CBBTC honeypot on Base*. Press **Crash test this wallet**. The recorder plays a real five-minute window reconstructed from Mobula history: 19 same-direction trades, the wallet's own 86% exit at T+250 s, and a **SECURITY BLOCK** because Mobula's static analysis flags the token as a honeypot with a 100% sell tax. Say: "Same model, real data, different failure mode."
3. Then paste any wallet a judge names, choose the chain and a 5-minute window, and press **Reconstruct crash test**. Point out the status bar: *Estimated reconstruction*, not *Live witnessed*, and that quotes are inferred from the price path and current depth.
4. After the run: drag the playhead back to the source exit, drag the amber marker to a later delay and watch the verdict change, then press **Share report** and show the link (size and delay live in the fragment only).

If the stream service is unreachable the page says so and only the bundled demo replay runs locally.
