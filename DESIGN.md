# Design

<!-- impeccable:design-schema 1 -->

## Decision history

1. **Exploration (2026-09-04, morning).** Three directions on identical data: laboratory instrument, crash telemetry / flight recorder, forensic editorial. The flight recorder won on comprehension and distinctiveness and shipped as the first primary experience. Screenshots: `docs/design-exploration/design-lab_*.png`, `primary-v1..v3`, `primary-final`.
2. **Redesign (2026-09-04, evening).** The founder judged the recorder still too close to a generic dark dashboard and pinned a new world: a **BIOS setup utility with Win95 dialogs**. Per the redesign rule, product truth, content, function and constraints were kept; the visual world was replaced, not blended. The flight recorder is retired and recorded here as anti-reference for this product: competent, but not memorable enough for a fifteen-second pitch.

## Visual world: the setup utility

Second Order is a diagnostic utility you run on a wallet before you copy it. The screen is a setup-utility page: navy field inside a teal desktop, cyan item labels, values in square brackets, a grey selection bar, an *Item Specific Help* column, block-glyph meters, and a function-key legend that is the only navigation. Decisions arrive as Win95 dialogs because a modal you must read is the honest way to deliver a verdict.

The world is not a costume. Every element does a job the product needs: the item list is the CrowdGuard input form, the help column carries the product's definitions in its own language, the block meters are the Remaining Alpha battery and the capacity surface, the cell grid is the shadow-follower swarm, and the dialog is the verdict.

### Colour (semantic, binding)

| Role | Token | Value |
|---|---|---|
| Desktop behind the utility | `--desk` | `#007f7f` |
| Setup field | `--bios-bg` | `#0000a8` |
| Body text | `--bios-fg` | `#a8a8a8` |
| Empty cells, rules, hints | `--bios-dim` | `#5454a8` |
| Item labels | `--bios-cyan` | `#54fcfc` |
| Titles, warnings, degrading capacity | `--bios-yellow` | `#fcfc54` |
| Available alpha, ALLOW | `--bios-green` | `#54fc54` |
| Failed capacity, BLOCK | `--bios-red` | `#fc5454` |
| Selection bar | `--bios-sel` / `--bios-sel-fg` | `#a8a8a8` / `#0000a8` |
| Win95 face / light / shadow / dark | `--w95-*` | `#c0c0c0` `#ffffff` `#808080` `#000000` |
| Win95 title bar | `--w95-title` | `#000080` |

Green, yellow and red keep the meanings the brief fixed: available alpha, degrading capacity, failed capacity. Cyan and grey carry neutral evidence. Colour is never the only carrier of a state: every verdict has a word, a dialog icon and a number.

### Type

- **VT323** (SIL OFL, self-hosted through `next/font`) for the whole setup screen at 22px (19px at tablet widths, 16px on phones). It renders like 8×16 VGA text and has the block glyphs the meters need.
- **Archivo** at 13px for Win95 dialog bodies and buttons, where a period bitmap sans would cost legibility.
- Uppercase is used the way a BIOS uses it: labels and values, never running help text.

### Components

- **Panel** `.bios-box`: 3px double rule, optional yellow title on the top edge.
- **SettingsList**: rows of `LABEL  [ VALUE ]`; the selected row inverts to the grey bar and shows its key hint. Readouts below a rule are coloured by state. Two pages, MAIN and TARGET WALLET, switched with F2.
- **Item Specific Help**: contextual definitions for the selected row.
- **Meters**: `█`/`░` glyph bars for Remaining Alpha, competing flow and execution depth. Filled cells are the semantic colour; empty cells are dim hatching.
- **Shadow-follower grid**: 5 rows (size) × 20 columns (delay) of boxed cells; hatched until the recorder passes that follower's delay, then coloured by outcome. Your own scenario is outlined in white.
- **Capacity map**: one bar per delay on a log dollar scale, the row matching your delay inverted, your size marked with ▲.
- **Key legend**: real buttons, each labelled with the key that also triggers it.
- **Win95 dialogs** (Radix Dialog for focus and Escape): CrowdGuard verdict with stop / warning / check icons drawn as SVG; Evidence Log as a scrolling inset with grooved groups.

### Motion

One authored moment: the run. Cells fill, meters drain, the verdict readout spins `| / - \`, and the CrowdGuard dialog appears when the recording ends. Under `prefers-reduced-motion` the spinner and caret stop; cells and meters still change per event because those are state, not decoration.

### Interaction

↑↓ select · +/− change · ⏎ edit inline · F2 page · F5 run / run again · F6 reconstruct target wallet · F8 block/unblock (local) · F9 evidence · F10 share report · ESC reset. Mouse and touch do everything the keys do. Intent (size, delay, crowd) persists in `localStorage` only.

## Surface: `/` (Operate)

Above the fold at 1440×900: title block, MAIN page with readouts, Item Specific Help, CRASH TEST RECORDER (meters, follower grid, capacity map, status line), key legend. Phones stack the panels and hide the help column; the recorder scrolls horizontally inside its panel.

## Anti-goals

No gradients, no glow, no rounded cards, no icon tiles, no emoji, no ambient animation. The world is committed: a half-BIOS with modern chrome would be the worst of both.
