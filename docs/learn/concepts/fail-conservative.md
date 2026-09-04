# Fail Conservative

Missing or stale data must never produce an ALLOW.

## Data quality

`deriveInputs` reports issues for: no market snapshot, stale market snapshot, no quotes, too few quotes, stale quotes, no security snapshot, incomplete security snapshot, a stale or reconnecting stream. Any issue marks the state degraded.

## Effect on the verdict

- A degraded state downgrades ALLOW to RESIZE and lists the reasons in the dialog and the Evidence Log.
- Critical security flags (`isHoneypot`, `balanceMutable`, `selfDestruct`) BLOCK regardless of outcome.
- No market and no quotes BLOCK: nothing to price against.
- Beyond the observed quote grid, confidence is `extrapolated`; without quotes it is `model`. Both are shown.

## Effect on the transport

- Stream stale (no frame for a configured window) or reconnecting: shown in the `STREAM` readout, and the reducer treats it as an issue.
- Stream service unreachable: the utility falls back to replaying the bundled fixture locally and labels the transport `LOCAL REPLAY`. Reconstruction and live modes are unavailable in that state and say so.

## Property tests

`packages/core/test/properties.test.ts` checks, over seeded random inputs, that EV is non-increasing in size and in flow ahead, that the solved capacity is scenario-compatible at itself and not above it, that capacity never increases when depth shrinks or fees rise, and that stale quotes, a stale stream, missing snapshots and critical flags never ALLOW.
