/**
 * Parameters for the synthetic "crowd capture" demo scenario.
 * These are fixtures. They are labelled Demo scenario everywhere they appear.
 * Calibrated with `pnpm --filter @second-order/replays calibrate -- --search` so that
 * the reducer reproduces the brief's numbers from the events alone.
 */
export interface DemoConfig {
  seed: number;
  sessionId: string;
  chainId: string;
  token: { address: string; symbol: string; name: string; decimals: number };
  quoteToken: { address: string; symbol: string; decimals: number };
  poolAddress: string;
  sourceWallet: string;
  sourceSizeUsd: number;
  sourcePriceUsd: number;
  /** Fixed gas/priority cost per trade, USD (Base-like). */
  sourceFeesUsd: number;
  /** Proportional aggregator fee per side, percent. */
  platformFeePct: number;
  /** Active quote-side depth (USD) at the pre-trade price. Reported liquidityUsd = 2× this. */
  quoteLiquidityUsd: number;
  /**
   * Concentrated-liquidity thinning: active depth at price p is L0 / (1 + depthDecay·|ln(p/p0)|)^2,
   * ratcheting down (positions left behind, LP withdrawals into the move). 0 = constant-product pool.
   */
  depthDecay: number;
  /** Active depth never falls below this share of the initial depth (some liquidity is full-range). */
  depthFloor: number;
  profile: { periodDays: number; realizedRatePct: number; realizedPnlUsd: number; winRatePct: number; typicalGainPct: number; tradeCount: number };
  flow: { count: number; totalUsd: number; startMs: number; endMs: number; burstUntilMs: number; burstShare: number };
  sourceExit: { atMs: number; fraction: number };
  quotes: { sizesUsd: number[]; everyMs: number; firstAtMs: number; endMs: number; noise: number };
  durationMs: number;
  defaultSpeed: number;
}

export const DEMO_CONFIG: DemoConfig = {
  seed: 20260904,
  sessionId: 'demo',
  chainId: 'evm:8453',
  token: { address: '0x4a3fd1c88e0b5b17e2a0d3d9b6a3b3f6c9d20e11', symbol: 'GLYPH', name: 'Glyph Protocol', decimals: 18 },
  quoteToken: { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 },
  poolAddress: '0x9b1e7c31d4a9f0a2d6c3b7e5f1a8d2c4b6e9f013',
  sourceWallet: '0x7c3f9a1d5e2b48c6f0a3d7e9b1c5f2a8d4e6b91e',
  sourceSizeUsd: 5_900,
  sourcePriceUsd: 0.0412,
  sourceFeesUsd: 0.04,
  platformFeePct: 0.3,
  quoteLiquidityUsd: 86_000,
  depthDecay: 1.37,
  depthFloor: 0.023,
  profile: { periodDays: 90, realizedRatePct: 186, realizedPnlUsd: 142_300, winRatePct: 63, typicalGainPct: 64, tradeCount: 217 },
  flow: { count: 64, totalUsd: 20_000, startMs: 700, endMs: 54_000, burstUntilMs: 30_000, burstShare: 0.2 },
  sourceExit: { atMs: 29_000, fraction: 0.55 },
  quotes: { sizesUsd: [100, 1_000, 5_000, 20_000], everyMs: 1_000, firstAtMs: 500, endMs: 60_000, noise: 0.0015 },
  durationMs: 60_000,
  defaultSpeed: 4,
};
