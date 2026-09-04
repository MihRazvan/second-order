# Demo video script (3:00)

Record at 1440×900 on https://second-order-crash-test.vercel.app with the keyboard visible in your head, not on screen. One take per act is fine; cut between them.

## 0:00–0:20 · Problem

Screen: the utility, armed. Cursor on `SOURCE RETURN +186%`.

> "Copy-trading tools rank wallets by what the wallet made. This one made 186% in ninety days. But you are not the wallet. You arrive seconds later, behind everyone else who saw the same trade, and you exit after the source has already sold into the same pool. Nothing tells you where the line is."

## 0:20–0:40 · Solution

Screen: move the selection to `INTENDED SIZE`, `FOLLOWER DELAY`, `REMAINING ALPHA`.

> "Second Order is an alpha crash test. It replays the trade, runs a hundred shadow followers at different delays and sizes against Mobula's quotes and competing flow, and tells you how much follower capital still has a positive outcome at your delay. Then CrowdGuard checks your size against it. Your size and delay never leave the browser."

## 0:40–2:20 · Demo

Screen: press **F5**.

> "F5 runs it. Followers board along the delay axis, green first. Competing flow enters. Execution depth thins. Remaining alpha drains from about fourteen thousand dollars… there: the source exits fifty-five percent while followers are still holding. That is source-exit overlap, not intent."

Dialog appears.

> "Verdict: resize, do not copy at a thousand dollars. Minus twelve point four percent. Maximum scenario-compatible size: eighty-four dollars. Copy anyway is greyed out."

Click **Resize to $84**, then **↓** to `FOLLOWER DELAY`, press **−** twice.

> "Resize lands on ALLOW. Move the delay and the capacity map re-solves instantly, in the browser."

Press **+** on `REPLAY` until *REAL: FAKE CBBTC HONEYPOT ON BASE*, press **F5**.

> "That first run was a calibrated fixture and says so. This one is real Mobula data: a Base wallet bought a token called CBBTC, nineteen trades followed, the wallet dumped eighty-six percent four minutes in, and Mobula's static analysis flags a honeypot with a hundred percent sell tax. Security block."

Press **F2**, **⏎**, paste a wallet, **⏎**, **F6**.

> "Or type any wallet. The stream service pulls its latest buy, the pool's trade history, five-second candles, depth and security from Mobula live, and replays the minutes after it. Labelled estimated reconstruction, never witnessed."

## 2:20–2:40 · Under the hood

Press **F9**.

> "Everything is traceable. Provenance, the quote grid, data quality, the security snapshot, the competing-flow ledger, the assumptions. The model is pure TypeScript with property tests: expected value falls with size and crowd, capacity is solved by bisection, and stale or missing data can only downgrade a verdict."

## 2:40–3:00 · Why it matters

Press **F10** to show the report.

> "This belongs next to every leaderboard number: how much of this wallet's edge survives being followed, and at what size. With Mobula's streams it becomes live witnessed; with enough witnessed runs it becomes Crowdproof, a reputation a wallet earns only when its signals survive followers. Second Order. A profitable wallet is not necessarily profitable to copy."

## Backup

`docs/assets/demo-backup.webm` is a Playwright-recorded run of act one and the honeypot replay, produced by `apps/web/scripts/record-demo.mjs`.
