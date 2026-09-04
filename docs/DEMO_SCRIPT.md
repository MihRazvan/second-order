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
