# Implementation Plan

Vertical milestones. Each ends with something runnable and inspected in a browser, not just compiled.

## Milestone 1 — Foundation and deterministic truth
- [x] Planning docs: PRODUCT.md, ARCHITECTURE.md, DECISIONS.md, IMPLEMENTATION_PLAN.md
- [x] pnpm workspace: `apps/web`, `apps/stream`, `packages/core`, `packages/contracts`, `packages/ui`, `data/replays`
- [x] `contracts`: DomainEvent envelope v1, all event payloads, SSE frame, snapshot, health, Mobula raw validators
- [x] `core`: quote grid interpolation, entry/exit model, follower outcome, capacity solver, remaining alpha, CrowdGuard, scenario reducer, shadow-follower sampler; README of assumptions; Vitest suite
- [x] `replays`: seeded generator producing `demo-crowd-capture.v1.json` (+ manifest with provenance `demo-scenario`), calibrated to the brief's fixture numbers (+186%, $14,200, $1,000 → −12.4%, $84)
- [x] `stream`: Fastify app, `ReplayDataSource`, event bus, `/health`, `/ready`, `/api/session/:id/snapshot`, `/api/session/:id/events` (SSE), in-memory persistence adapter, Drizzle schema + migration
- Exit criterion: `pnpm test` green; `curl` of the SSE endpoint shows the replay streaming with correct timing.

## Milestone 2 — Design lab
- [x] Impeccable-style init/shape artefacts: `.impeccable/config.json`, `.impeccable/surfaces/home.md`
- [x] Tokens, fonts, base layer in `apps/web`
- [x] `/design-lab/a` laboratory instrument · `/design-lab/b` crash telemetry / flight recorder · `/design-lab/c` forensic editorial — identical demo data, static end-state of the story
- [x] Playwright inspection at 1440×900 of each; screenshots into `docs/design-exploration/`
- [x] Score (40% comprehension, 30% distinctiveness, 20% trust, 10% feasibility), choose, write DESIGN.md
- Exit criterion: DESIGN.md exists with the chosen world, tokens and the reasoning; three screenshots archived.

## Milestone 3 — The fifteen-second demo
- [x] Primary route built from the chosen direction: source identity + ROI, "Crash test this wallet", shadow-follower swarm, Remaining Alpha instrument, delay + crowd controls, capacity curve, intended-size input, CrowdGuard verdict, provenance indicator, mode + freshness indicator
- [x] Session start through the stream service, SSE consumption, browser replay fallback
- [x] Motion that explains state changes; `prefers-reduced-motion` path
- [x] Three browser-inspected iterations at 1440×900, 1280×800, 390×844; console/network clean
- [x] Playwright e2e of the full sequence; screenshot baselines of approved states
- Exit criterion: the transition from profitable source to unprofitable follower is unmistakable in 15 seconds at 1440×900.

## Milestone 4 — Evidence and provenance
- [x] Evidence drawer: observed quote grid, competing flow ledger, security snapshot, assumptions, confidence, raw event ids
- [x] Provenance states rendered everywhere numbers appear (demo / estimated / live witnessed)
- [x] Degraded states: stale stream, partial grid, missing security, replay fallback
- [x] Reducer property tests (monotonicity of EV in size and crowd; no ALLOW on stale/missing)
- Exit criterion: a judge can trace the verdict to its inputs without reading source.

## Milestone 5 — Mobula live
- [x] Capability detection against the configured key; plan-gated endpoints reported explicitly
- [x] REST adapters: wallet trades v2, wallet analysis, token security, market details, swap quoting
- [x] WSS adapters: quoting stream, fast trades (asset mode); reconnect/backoff/heartbeat/stale/rate-limit (enriched swaps deferred: fast-trade asset mode covers the same-token flow we need)
- [x] Integration tests: recorded raw frames → normalized events
- [ ] Capture one real session into `data/replays/*.live-witnessed.v1.json` with provenance metadata — **blocked: no MOBULA_API_KEY available in this environment; CAPTURE_DIR recorder is implemented**
- Exit criterion: the same UI runs on a live session with the mode indicator reading "Live".

## Milestone 6 — Ship
- [x] Railway config (`railway.json` per service), health checks, restart policies, env var docs
- [x] README with architecture summary, run/demo commands, Mobula access matrix
- [x] Demo script (what to click, what to say, 15 seconds)
- [x] Remove `/design-lab/*` routes; keep `docs/design-exploration/`
- Exit criterion: fresh clone → `pnpm install && pnpm dev` → demo works with no secrets.

## Later (not before the demo works)
- Crowdproof credential
- Multiple tracked wallets / session history browser
