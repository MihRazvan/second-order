# Surface brief · `/` (apps/web/app/page.tsx)

Mode: **Operate**. The visitor is a trader deciding, in seconds, whether to copy a wallet's trade and at what size.

## Job and audience
A copy-trader with a wallet in mind and an intended size. Secondary: a technical judge who wants to trace every number to an observation.

## Outcome and proof
Primary task: press "Crash test this wallet", watch the shadow-follower simulation run, read the CrowdGuard verdict for their own size and delay, and act (resize or block). Proof is the recorder itself: Remaining Alpha draining, competing flow arriving, execution depth thinning, the source exit flag, and the evidence drawer.

## Selected direction
Flight recorder (DESIGN.md). Structural thesis: one time axis, three lanes, one playhead; the story is told in a readout strip before any chart is read. Focal moment: the annunciator flipping to CROWD CAPTURE RISK at the end of the run.

## Scope and boundaries
Above the fold at 1440×900: header, readout strip, recorder, controls strip. Below: evidence drawer trigger and methodology. Untouched: no navigation chrome, no wallet connect, no execution. Anti-goals: candlesticks, order books, glow, gradients, eyebrow labels, emoji icons, ambient motion.

## States and ranges
armed · connecting · running (0–60 s event time at 4×) · ended (ALLOW / RESIZE / BLOCK) · failed · wallet blocked (local). Data quality: fresh · stale · degraded (no ALLOW) · local replay fallback. Sizes $1–$50k, delays 0.3–45 s, competing flow 0–$100k.

## Interaction and layout
Controls are user-local and persist in localStorage only. Resize sets the intended size to the maximum scenario-compatible size and lands on ALLOW. Block stores the wallet locally. Reduced motion: no playhead glide, no fill transitions, instant flip.

## Constraints and open decisions
No secrets in the browser. Provenance visible next to every group of numbers. Open: how the live mode surfaces plan-gated Mobula capabilities in the status bar (Milestone 5 UI).
