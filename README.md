# Second Order — Alpha Crash Test

A profitable source wallet is not necessarily profitable to copy. Second Order replays a tracked wallet's trade, runs a **shadow-follower simulation** across delays and sizes against observed quotes and **competing flow**, drains a **Remaining Alpha** meter as capacity is consumed, and returns a private **CrowdGuard** verdict for your own intended size: ALLOW, RESIZE or BLOCK.

The central object is the Alpha Capacity Surface, `C(delay, crowd AUM)`: the maximum aggregate follower capital for which the trade's scenario-adjusted follower expected value remains positive.

> Everything you see in the default demo is labelled **Demo scenario**. It is a synthetic fixture. No live capture exists until a session is run against Mobula with a Growth-plan key (see below).

## Run the demo

```bash
corepack enable            # pnpm 10
pnpm install
pnpm dev                   # web on :3000, stream on :4010
```

Open http://localhost:3000 and press **Crash test this wallet**. The run takes about fifteen seconds. If the stream service is not reachable the page falls back to replaying the same fixture in the browser and says so in the status bar (`?stream=off` forces that path).

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

The stream service probes each capability at start and reports `available`, `plan-gated`, `unreachable` or `disabled` at `GET /api/capabilities`; the UI degrades explicitly. Set `MOBULA_API_KEY` in `apps/stream/.env` (never in the web app). With `CAPTURE_DIR` set, an ended live session is written as a replay file with `live-witnessed` provenance.

## Deployment

One Railway project, two services from this repo (`apps/web/railway.json`, `apps/stream/railway.json`) plus Railway PostgreSQL. Variables: `MOBULA_API_KEY`, `DATABASE_URL`, `CORS_ORIGIN` on `stream`; `NEXT_PUBLIC_STREAM_URL` on `web`. Health: `/health` and `/ready` on stream, `/api/health` on web. Nothing is deployed from this repository without explicit approval.

## Truthfulness

Simulated followers are not real followers. Same-direction trades do not prove copy-trading. A source exit that overlaps follower exits describes timing, not intent. Scenario estimates do not guarantee returns. Historical reconstruction is not live witnessing. The system is not completely private or trustless: user intent stays in the browser, but the stream service still sees which wallet is being tested.
