import { scalePow } from 'd3-scale';

/** Recorder time axis: square-root time so the first seconds (where copy latency matters) get room. */
export const timeScale = (durationMs: number, range: [number, number]) =>
  scalePow().exponent(0.5).domain([0, durationMs]).range(range).clamp(true);

const BASE_TICKS_MS = [0, 1000, 2000, 5000, 10_000, 20_000, 40_000, 60_000, 120_000, 180_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000];
/** Ticks for a recorder of `durationMs`: the sqrt axis needs denser marks early, sparser late. */
export const timeTicks = (durationMs: number) => {
  const ticks = BASE_TICKS_MS.filter((ms) => ms <= durationMs);
  if (ticks[ticks.length - 1] !== durationMs && durationMs > 60_000) ticks.push(durationMs);
  return ticks;
};
export const TIME_TICKS_MS = BASE_TICKS_MS;
export const tickLabel = (ms: number) => (ms === 0 ? 'T+0' : ms < 1000 ? `${ms}ms` : ms < 120_000 ? `${ms / 1000}s` : `${Math.round(ms / 60_000)}m`);
