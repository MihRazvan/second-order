# Second Order — Alpha Crash Test

A profitable source wallet is not necessarily profitable to copy. Second Order replays a tracked wallet's trade, runs a **shadow-follower simulation** across delays and sizes against observed quotes and **competing flow**, drains a **Remaining Alpha** meter as capacity is consumed, and returns a private **CrowdGuard** verdict for your own intended size: ALLOW, RESIZE or BLOCK.

The central object is the Alpha Capacity Surface, `C(delay, crowd AUM)`: the maximum aggregate follower capital for which the trade's scenario-adjusted follower expected value remains positive.

> The default replay is labelled **Demo scenario**: a synthetic, calibrated fixture. Type any wallet into the form to get an **Estimated reconstruction** built from real Mobula history (works even without a key through Mobula's demo API). **Live witnessed** sessions need a Growth-plan key for the WebSocket streams.

## Run the demo

```bash
corepack enable            # pnpm 10
pnpm install
pnpm dev                   # web on :3000, stream on :4010
```

Open http://localhost:3000 and press **Crash test this wallet**. The run takes about fifteen seconds. If the stream service is not reachable the page falls back to replaying the same fixture in the browser and says so in the status bar (`?stream=off` forces that path).

To crash-test a real wallet, paste its address in **Crash test any wallet**, pick the chain and window, and press **Reconstruct crash test**. The stream service anchors on the wallet's most recent buy that is at least one window old, pulls the pool's trade history, 5-second candles, security and market context from Mobula, and replays the reconstructed minutes in about fifteen seconds. Every completed run has a **Share report** link (`/report/<sessionId>`), with your size and delay carried only in the URL fragment. With `CAPTURE_DIR` set, reconstructions are saved as replay files and appear in the replay picker.

Useful commands:

```bash
pnpm test                  # Vitest: core model, contracts, fixtures, stream service, normalizers
pnpm test:e2e              # Playwright: the fifteen-second flow at 1440×900, 1280×800, 390×844
pnpm replays:generate      # regenerate the demo fixture from data/replays/src/scenario-config.ts
pnpm --filter @second-order/replays calibrate   # print the brief's numbers as the reducer sees them
node apps/web/scripts/demo-run.mjs out/ 1440x900  # drive the demo and capture frames
```

## Architecture in one paragraph

`packages/contracts` (Zod, versioned `DomainEvent` envelope with explicit provenance) → `packages/core` (pure capacity model: quote-grid interpolation, entry/exit pricing, capacity solver, fail-conservative CrowdGuard, scenario reducer) → `data/replays` (seeded deterministic fixtures with manifests) → `apps/stream` (Fastify; `ReplayDataSource` and `MobulaDataSource` emit identical normalized events; SSE fan-out; optional PostgreSQL via Drizzle) → `apps/web` (Next.js; the browser reduces the same events and computes the verdict locally so intended size, delay and policy never leave it). Details: [ARCHITECTURE.md](ARCHITECTURE.md), [DECISIONS.md](DECISIONS.md), [DESIGN.md](DESIGN.md), [packages/core/README.md](packages/core/README.md).

## Mobula access

| Capability | Endpoint | Plan | Used for |
|---|---|---|---|
| Wallet trades v2 | `GET /api/2/wallet/trades` | Free+ | source trade anchor, source exits (poll fallback) |
| Wallet analysis | `GET /api/2/wallet/analysis` | Free+ (5 credits) | historical performance context |
| Token security | `GET /api/2/token/security` | Free+ (10 credits) | taxes, honeypot and critical flags |
| Market details | `GET /api/2/market/details` | Free+ | reported liquidity, spot |
| Swap quoting | `GET /api/2/swap/quoting` | Free+ | quote fallback when the stream is plan-gated |
| Quoting stream | `wss://api.mobula.io` type `quoting` | **Growth+** | live quotes at several sizes |
| Fast trades stream | `wss://api.mobula.io` type `fast-trade` | **Growth+** | competing flow and source exits |

Reconstruction additionally uses `GET /api/2/token/trades` (pair mode) and `GET /api/2/market/ohlcv-history` (5s candles), both Free+. Without a key the service talks to `demo-api.mobula.io` (rate limited, no signup); with `MOBULA_API_KEY` in `apps/stream/.env` it uses `api.mobula.io`. The service probes each capability at start and reports `available`, `plan-gated`, `unreachable` or `disabled` at `GET /api/capabilities`; `/health` reports `mobula: ready` only when a stream is available, otherwise `rest-only`, and the UI offers live sessions only in the former case. Ended live and reconstruction sessions are written to `CAPTURE_DIR` as replay files with their provenance.

## Deployment

One Railway project, two services from this repo (`apps/web/railway.json`, `apps/stream/railway.json`) plus Railway PostgreSQL. Variables: `MOBULA_API_KEY`, `DATABASE_URL`, `CORS_ORIGIN` on `stream`; `NEXT_PUBLIC_STREAM_URL` on `web`. Health: `/health` and `/ready` on stream, `/api/health` on web. Nothing is deployed from this repository without explicit approval.

## Truthfulness

Simulated followers are not real followers. Same-direction trades do not prove copy-trading. A source exit that overlaps follower exits describes timing, not intent. Scenario estimates do not guarantee returns. Historical reconstruction is not live witnessing. The system is not completely private or trustless: user intent stays in the browser, but the stream service still sees which wallet is being tested.
