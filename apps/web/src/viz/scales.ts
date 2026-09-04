import { scaleLog, scaleLinear } from 'd3-scale';

export const DELAY_DOMAIN: [number, number] = [300, 45_000];
export const SIZE_DOMAIN: [number, number] = [50, 5_000];

export const delayScale = (range: [number, number]) => scaleLog().domain(DELAY_DOMAIN).range(range).clamp(true);
export const sizeScale = (range: [number, number]) => scaleLog().domain(SIZE_DOMAIN).range(range).clamp(true);
export const linear = (domain: [number, number], range: [number, number]) => scaleLinear().domain(domain).range(range).clamp(true);

/** Semantic colour for a scenario-adjusted outcome. Thresholds are shared across every visual. */
export function evColor(evPct: number): string {
  if (evPct >= 2) return 'var(--so-alpha)';
  if (evPct >= -2) return 'var(--so-amber)';
  return 'var(--so-red)';
}
export function evTone(evPct: number): 'alpha' | 'amber' | 'red' {
  if (evPct >= 2) return 'alpha';
  if (evPct >= -2) return 'amber';
  return 'red';
}
