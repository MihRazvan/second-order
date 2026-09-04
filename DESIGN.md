# Design

<!-- impeccable:design-schema 1 -->

## Decision

Three hero alternatives were built on identical demo data and inspected at 1440×900 (screenshots in `docs/design-exploration/`). Scores use the brief's weights: 40% immediate comprehension, 30% distinctiveness, 20% trust and credibility, 10% implementation feasibility.

| Direction | Comprehension | Distinctiveness | Trust | Feasibility | Weighted |
|---|---|---|---|---|---|
| A · Laboratory instrument | 7 | 6 | 8 | 9 | 7.1 |
| **B · Crash telemetry / flight recorder** | **8.5** | **8.5** | 8 | 8 | **8.35** |
| C · Forensic editorial analysis | 7 | 7 | 8.5 | 9 | 7.5 |

**Chosen: B, the flight recorder.**

Why B: the readout row states the whole story in one line (`+186%` for the wallet, `$0` alpha remaining, `−13.5%` for you, verdict) before any chart is read. Time is explicit on the page, so the fifteen-second demo has a natural mechanism: a playhead sweeps the recorder while lanes fill and the Remaining Alpha area drains. The draining area is the one signature element the brief asked for. It reads as an incident recorder, not a trading terminal.

Why not A: the log-log chamber is the most honest picture of the capacity surface (delay × size) and is kept as a secondary view, but the story splits across three columns and the burette is weak. Why not C: strongest single sentence, but comprehension depends on reading that sentence; it is static and calm where the brief asks for controlled danger.

Defects noted in B's first cut, fixed in the build: lane labels colliding with values (label gutter too narrow), followers compressed into the first seconds on a linear time axis (recorder now uses a square-root time axis, ticks labelled), empty space below the recorder (controls and capacity curve occupy it), verdict panel too small for the decisive moment.

## Visual world

An incident flight recorder for onchain copy-trading. Dark graphite instrument housing; readings in a condensed technical mono; lanes ruled like recorder paper; one moving playhead. Nothing glows. Colour appears only where it means something.

- **Foundation:** graphite, faintly cool (`--so-bg` oklch 0.155 / 0.008 / 250). Raised surfaces one step lighter, sunken lanes one step darker. Rules are 1px, low contrast.
- **Semantic colour (binding):** available alpha = high-visibility green `--so-alpha` (oklch 0.86 0.23 140); degrading capacity and warnings = safety amber `--so-amber` (oklch 0.80 0.16 75); failed capacity and blocked actions = controlled red `--so-red` (oklch 0.66 0.20 25); neutral evidence = cool off-white `--so-fg` and desaturated technical blue-grey `--so-evidence`.
- **Type:** Archivo (variable, width axis) for interface and headings; Martian Mono for every number, timestamp, address and lane label, tabular figures always. No Inter, no system sans, no Geist. Display numerals up to 38px in the readout row; body 15px/1.45; captions 12px.
- **Shape:** rectangles, 0 radius on instrument surfaces, 2px on buttons. No pills. No nested cards: the readout row is a single ruled strip, the recorder is one surface.
- **Depth:** none by shadow. Hierarchy by surface step and rule weight.
- **Motion:** one authored moment, the playhead sweep with lanes filling and the alpha area draining. Exponential ease-out for the annunciator flip. Under `prefers-reduced-motion` the playhead does not glide; lanes update per event and the flip is instant.
- **Icons:** none decorative. Provenance and stream state are text plus a 6px status square.

## Surface: `/` (Operate mode)

Above the fold at 1440×900, in reading order: header (name, mode, provenance, clock) · readout row (tracked wallet with realized return · Remaining Alpha · your copy · verdict/annunciator or the "Crash test this wallet" action) · recorder (Remaining Alpha lane, shadow-follower boarding lane with competing-flow bars, execution-depth lane, source-exit flag, playhead) · controls strip (intended size, delay, additional crowd) with the capacity curve. Below the fold: evidence drawer trigger and methodology.

Anti-goals: no candlesticks, no order book, no purple gradients, no eyebrow labels above headings, no glassmorphism, no ambient animation, no emoji.

## Copy rules

Use the product's terms exactly: shadow-follower simulation, competing flow, source-exit overlap, scenario-adjusted outcome, estimated, live witnessed, maximum scenario-compatible size, Demo scenario. Every number carries its provenance within the same visual group.
