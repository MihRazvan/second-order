/**
 * User policy. Lives in the browser only; never sent to the server.
 */
export interface CrowdGuardPolicy {
  /** Minimum scenario-adjusted EV (percent) for ALLOW. */
  minEvPct: number;
  /** Below this a resize is not worth making; the verdict becomes BLOCK. */
  minSizeUsd: number;
  /** Inputs older than this (event-time ms) are stale. */
  quoteStaleAfterMs: number;
  marketStaleAfterMs: number;
  /** Require a security snapshot for ALLOW. */
  requireSecurity: boolean;
  /** Minimum observed quotes for ALLOW. */
  minObservedQuotes: number;
}

export const DEFAULT_POLICY: CrowdGuardPolicy = {
  minEvPct: 2,
  minSizeUsd: 25,
  quoteStaleAfterMs: 20_000,
  marketStaleAfterMs: 120_000,
  requireSecurity: true,
  minObservedQuotes: 3,
};

export interface UserIntent {
  sizeUsd: number;
  delayMs: number;
}

export const DEFAULT_INTENT: UserIntent = { sizeUsd: 1000, delayMs: 5000 };
