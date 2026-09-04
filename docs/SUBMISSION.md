# TAIKAI submission sheet — Common S3nse 2026

Deadline: **Saturday, September 5, 09:00 CEST**. Open every link below in a private window before submitting.

## Project basics

| Field | Value |
|---|---|
| Project / team name | **Second Order** |
| Short description | Second Order is an onchain Alpha Crash Test. Before you copy a wallet, it estimates what a follower actually receives after delay, size, competing flow, thinning depth and the source's own exit, using Mobula wallet, trade, market and security data, and returns a private ALLOW / RESIZE / BLOCK verdict. Your intended size and delay never leave your browser. |
| Team members | Razvan Mihailescu (fill in roles / additional members) |
| Main team contact | Razvan Mihailescu · tech@astrarizon.com · GitHub MihRazvan |
| Topic / category | DeFi (primary) · Security (token-security gating, fail-conservative verdicts) · Privacy (user intent stays local) |
| Bounties entered | **Mobula — Build the Future of Onchain Discovery and Social Trading** |
| Track | Start from Scratch |

## Code & build

| Field | Value |
|---|---|
| Repository | https://github.com/MihRazvan/second-order (public) |
| README | https://github.com/MihRazvan/second-order/blob/main/README.md |
| Technologies used | TypeScript, Next.js 16, React 19, Tailwind 4, Radix, Fastify, Server-Sent Events, Zod, Drizzle ORM, PostgreSQL, Vitest, Playwright, pnpm workspaces, Railway, Vercel |
| Partner technologies used | **Mobula**: `GET /api/2/wallet/trades` (anchor buy, source exits), `GET /api/2/wallet/analysis` (leaderboard return), `GET /api/2/token/trades` (competing flow in the pool), `GET /api/2/market/ohlcv-history` (5-second price path), `GET /api/2/market/details` (depth, spot), `GET /api/2/token/security` (taxes, honeypot and critical flags), `GET /api/2/swap/quoting` (quote fallback); WebSocket `quoting` and `fast-trade` streams implemented with reconnect/backoff/stale handling, plan-gated on the key we hold. Keyless demo API supported for first-run. |
| What was built during Common S3nse | Everything in the repository: contracts, the pure capacity model with property tests, the seeded fixture generator and calibration search, the Fastify stream service (replay, reconstruction and live providers, SSE, PostgreSQL persistence, capture), the Mobula adapters, the BIOS-style utility with keyboard navigation and Win95 dialogs, the report route, 55 unit tests and 15 e2e tests, Railway and Vercel deployments, and this documentation. Git history is dated 2026-09-04. |
| Pre-existing work | None. No prior code was reused beyond public open-source packages listed in `pnpm-lock.yaml`. The two real reconstructions bundled as replays were captured from Mobula during the hackathon and are labelled as such. |

## Demo

| Field | Value |
|---|---|
| Demo video | *(paste link)* — script in `docs/DEMO_VIDEO_SCRIPT.md`; backup recording in `docs/assets/demo-backup.webm` |
| Working deployment | https://second-order-crash-test.vercel.app |
| Stream API | https://stream-production-900a.up.railway.app/health · https://stream-production-900a.up.railway.app/api/capabilities |
| Contract addresses | None. Second Order is off-chain analysis over onchain data; it does not deploy contracts or execute trades. |
| Testing instructions | See below. |

### Testing instructions for judges

**Hosted (no setup):**
1. Open https://second-order-crash-test.vercel.app. The utility boots armed on the calibrated demo scenario (labelled DEMO SCENARIO).
2. Press **F5**. In about fifteen seconds the CrowdGuard dialog reports RESIZE, −12.4%, maximum scenario-compatible size $84.
3. Use **+/−** on `REPLAY` to switch to *REAL: FAKE CBBTC HONEYPOT ON BASE* (real Mobula data, ESTIMATED RECONSTRUCTION) and press **F5** again: SECURITY BLOCK.
4. Press **F2**, then on `TARGET WALLET` press **⏎**, paste any EVM wallet with recent activity (for example `0x2acbe7e9a41690af1353d0ce2991748ecd8b6e6c`), press **⏎**, then **F6**. The stream service fetches the wallet's latest buy and the pool's history from Mobula live and replays the reconstructed window.
5. **F9** opens the Evidence Log (provenance, model inputs, data quality, quotes, security, flow ledger, assumptions). **F10** opens the shareable report.

**Local:**
```bash
git clone https://github.com/MihRazvan/second-order && cd second-order
corepack enable && pnpm install
pnpm dev          # web http://localhost:3000 · stream http://localhost:4010
pnpm test         # 55 unit/integration tests
pnpm test:e2e     # 15 Playwright tests (needs pnpm dev running)
```
Optional `apps/stream/.env`: `MOBULA_API_KEY` (otherwise the keyless demo API is used), `DATABASE_URL`, `CAPTURE_DIR`.

## Mobula bounty requirements — self-check

| Requirement | Status |
|---|---|
| Mobula powers a meaningful part of the product | Yes: every observation in a reconstruction (trades, analysis, pool history, candles, depth, security) is a Mobula call; the model is useless without them. |
| More than a single API request | Six REST endpoints combined per reconstruction; two WebSocket streams implemented. |
| Functional demo | Hosted utility + stream API; local run in two commands. |
| Public GitHub repository with setup instructions | Yes. |
| Explain which endpoints and why | README "How It Works" and `docs/learn/stream-api.md`; per-endpoint reasons in `PRODUCT.md` and `ARCHITECTURE.md`. |
| Created during the hackathon | Yes, all of it. |
| Live data rather than a hard-coded dataset | Reconstructions fetch Mobula at request time for any wallet. The default replay is a synthetic, labelled fixture used to tell the calibrated story; the two REAL replays are captured Mobula data; F6 is live. |
| Reliability, security, error handling | Zod validation at every boundary, idempotent ingestion, rate limiting with Retry-After, reconnect with backoff and jitter, stale detection, typed errors without stack traces, browser replay fallback, fail-conservative verdicts, no secrets in the client. |

**Bonus points:** real-time WebSocket adapters (plan-gated on our key, so honest about it); six endpoints combined; multi-chain reconstruction (Base, Ethereum, Arbitrum, BNB verified; Solana wired, untested); Item Specific Help explains every number to non-crypto-native users; path to product: CrowdGuard as a pre-trade check inside copy-trading UIs and leaderboards, Crowdproof reputation credential.

## Privacy, security & sovereignty self-check (handbook)

- **Data collected:** the wallet you test and the session events derived from public Mobula data. Your size, delay, crowd assumption, policy and blocked list stay in `localStorage`.
- **Storage:** PostgreSQL on Railway (session events, capacity snapshots at a fixed reference delay, manifests, processing errors). No user identity.
- **Metadata leak:** the stream service and Mobula see which wallet is being tested and when.
- **Secrets:** Mobula key only in the stream service environment; never in the browser bundle; `.env` git-ignored.
- **Admin privileges:** none in the product; infrastructure access is the deployer's.
- **Dependency failure:** Mobula down → reconstruction returns a typed error, replay still works; stream down → browser replay fallback, labelled LOCAL REPLAY.
- **Trust assumptions:** Mobula's observations are trusted as observations; the model is an estimate and says so; nothing is called private or trustless that is not.
- **Sovereignty:** no accounts, no lock-in; every report is recomputed from events that can be exported from the stream API.
