# Stream API

Base URL locally: `http://localhost:4010`. Production: `https://stream-production-900a.up.railway.app`.

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | status, persistence (`postgres` / `memory`), providers (`replay`, `mobula`: `ready` / `rest-only` / `disabled`, `reconstruction`) |
| GET | `/ready` | 200 when the store answers |
| GET | `/api/replays` | bundled and captured replay manifests with provenance and disclosure |
| GET | `/api/replays/:id/context` | the events at the fixture origin (the wallet's context before a run) |
| GET | `/api/capabilities` | per-endpoint capability: `available` / `plan-gated` / `unreachable` / `unknown` / `disabled` |
| POST | `/api/sessions` | `{ mode: 'replay' \| 'reconstruction' \| 'live', replayId?, speed?, wallet?, chainId?, windowSeconds?, tradeIndex? }` → session info |
| GET | `/api/sessions/:id` | session info |
| GET | `/api/sessions/:id/events` | Server-Sent Events: `{kind:'event', event}` frames with `id: <seq>`, heartbeats every 5 s, `{kind:'ended'}`; supports `Last-Event-ID` |
| GET | `/api/sessions/:id/snapshot` | all events of a session (memory or rebuilt from PostgreSQL) |
| GET | `/api/sessions/:id/reference-verdict` | verdict at a fixed 5 s / $250 for evidence; user intent never reaches this service |
| GET | `/api/sessions/persisted` | sessions known to the store |
| DELETE | `/api/sessions/:id` | stop a session |

## Events

Every frame is a `DomainEvent` (`packages/contracts/src/events.ts`): versioned envelope `{ v, id, seq, at, sessionId, provenance, type, payload }`. Types: `source.trade`, `source.exit`, `source.profile`, `quote.observed`, `flow.competing`, `security.snapshot`, `market.snapshot`, `stream.status`, `scenario.marker`. Ids are deterministic (tx hash, quote sequence), so ingestion is idempotent.

## Example

```bash
curl -s -X POST https://stream-production-900a.up.railway.app/api/sessions \
  -H 'content-type: application/json' \
  -d '{"mode":"reconstruction","wallet":"0x2acbe7e9a41690af1353d0ce2991748ecd8b6e6c","chainId":"evm:8453","windowSeconds":300}'
# → {"sessionId":"…"}; then
curl -N https://stream-production-900a.up.railway.app/api/sessions/<id>/events
```
