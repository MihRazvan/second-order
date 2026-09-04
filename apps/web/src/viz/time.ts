import { scalePow } from 'd3-scale';

/** Recorder time axis: square-root time so the first seconds (where copy latency matters) get room. */
export const timeScale = (durationMs: number, range: [number, number]) =>
  scalePow().exponent(0.5).domain([0, durationMs]).range(range).clamp(true);

export const TIME_TICKS_MS = [0, 1000, 2000, 5000, 10_000, 20_000, 40_000, 60_000];
export const tickLabel = (ms: number) => (ms === 0 ? 'T+0' : ms < 1000 ? `${ms}ms` : `${ms / 1000}s`);
