import type {
  CompetingFlow,
  DomainEvent,
  MarketSnapshot,
  ProvenanceKind,
  QuoteObserved,
  ScenarioMarker,
  SecuritySnapshot,
  SourceExit,
  SourceProfile,
  SourceTrade,
  StreamStatus,
} from '@second-order/contracts';
import { buildQuoteGrid, worstConfidence, type Confidence, type GridQuote } from './grid';
import { followerOutcome, solveCapacity, type CapacityResult, type ModelInputs, type Outcome } from './model';
import { DEFAULT_POLICY, type CrowdGuardPolicy, type UserIntent } from './policy';
import { logUniform, mulberry32 } from './random';

// ---------------------------------------------------------------------------
// State + reducer
// ---------------------------------------------------------------------------

export interface TimelineMarker extends ScenarioMarker {
  at: number;
  id: string;
}

export interface ScenarioState {
  sessionId: string | null;
  seq: number;
  lastEventAt: number;
  provenanceKinds: ProvenanceKind[];
  sourceTrade: (SourceTrade & { at: number }) | null;
  sourceExits: (SourceExit & { at: number })[];
  profile: SourceProfile | null;
  market: MarketSnapshot | null;
  security: SecuritySnapshot | null;
  quotes: (QuoteObserved & { at: number })[];
  flows: (CompetingFlow & { at: number })[];
  status: StreamStatus | null;
  markers: TimelineMarker[];
  /** Ids already applied; guarantees idempotent ingestion. */
  seen: Set<string>;
  duplicates: number;
}

export function initialScenarioState(): ScenarioState {
  return {
    sessionId: null,
    seq: -1,
    lastEventAt: 0,
    provenanceKinds: [],
    sourceTrade: null,
    sourceExits: [],
    profile: null,
    market: null,
    security: null,
    quotes: [],
    flows: [],
    status: null,
    markers: [],
    seen: new Set(),
    duplicates: 0,
  };
}

export function reduceScenario(state: ScenarioState, event: DomainEvent): ScenarioState {
  if (state.seen.has(event.id)) return { ...state, duplicates: state.duplicates + 1 };
  const seen = new Set(state.seen);
  seen.add(event.id);
  const next: ScenarioState = {
    ...state,
    seen,
    sessionId: event.sessionId,
    seq: Math.max(state.seq, event.seq),
    lastEventAt: Math.max(state.lastEventAt, event.at),
    provenanceKinds: state.provenanceKinds.includes(event.provenance.kind)
      ? state.provenanceKinds
      : [...state.provenanceKinds, event.provenance.kind],
  };
  switch (event.type) {
    case 'source.trade':
      return { ...next, sourceTrade: { ...event.payload, at: event.at } };
    case 'source.exit':
      return { ...next, sourceExits: [...state.sourceExits, { ...event.payload, at: event.at }] };
    case 'source.profile':
      return { ...next, profile: event.payload };
    case 'market.snapshot':
      return { ...next, market: event.payload };
    case 'security.snapshot':
      return { ...next, security: event.payload };
    case 'quote.observed':
      return { ...next, quotes: [...state.quotes, { ...event.payload, at: event.at }] };
    case 'flow.competing':
      return { ...next, flows: [...state.flows, { ...event.payload, at: event.at }] };
    case 'stream.status':
      return { ...next, status: event.payload };
    case 'scenario.marker':
      return { ...next, markers: [...state.markers, { ...event.payload, at: event.at, id: event.id }] };
    default:
      return next;
  }
}

// ---------------------------------------------------------------------------
// Derivation: observations → model inputs (+ data quality)
// ---------------------------------------------------------------------------

export interface DataQuality {
  observedQuotes: number;
  quoteAgeMs: number | null;
  marketAgeMs: number | null;
  hasSecurity: boolean;
  securityCompleteness: number;
  sourceExitWitnessed: boolean;
  streamState: StreamStatus['state'] | 'unknown';
  issues: string[];
  /** True when any input is missing or stale; blocks ALLOW. */
  degraded: boolean;
}

export interface DerivedInputs {
  inputs: ModelInputs;
  quality: DataQuality;
  /** Execution depth (USD) implied by the latest observed quotes, null when unmeasured. */
  impliedDepthUsd: number | null;
  /** Spot ratio vs source execution used by the model fallback. */
  spotRatio: number;
  /** Current spot ratio vs source execution from the latest quotes. */
  spotNow: number;
  /** Realized same-direction flow (USD) with delay ≤ d. */
  realizedFlowAt(delayMs: number): number;
  /** Total same-direction competing flow observed (USD). */
  competingFlowUsd: number;
  competingFlowCount: number;
  /** Source position value at target if fully exited (USD). */
  assumedSourceExitUsd: number;
  witnessedSourceExitUsd: number;
}

export interface DeriveOptions {
  /** Event-time "now"; defaults to the latest event time. */
  nowAt?: number;
  policy?: CrowdGuardPolicy;
  /** Fallback typical gain (percent) when the profile has none. */
  defaultTypicalGainPct?: number;
  /** Fallback fixed fees (USD) when the source trade has none. */
  defaultFixedFeesUsd?: number;
  /** Fallback proportional platform fee per side (percent) when the source trade has none. */
  defaultPlatformFeePct?: number;
}

export function deriveInputs(state: ScenarioState, opts: DeriveOptions = {}): DerivedInputs | null {
  const trade = state.sourceTrade;
  if (!trade) return null;
  const policy = opts.policy ?? DEFAULT_POLICY;
  const nowAt = opts.nowAt ?? state.lastEventAt;

  const liquidityUsd = state.market?.liquidityUsd ?? 0;
  const quoteLiquidityUsd = Math.max(1, liquidityUsd / 2);
  // Spot right after the source trade, when the market snapshot post-dates it. Model fallback only.
  const spotRatio = state.market && state.market.observedAt >= trade.at && state.market.priceUsd > 0
    ? Math.max(1, state.market.priceUsd / trade.executionPriceUsd)
    : 1;

  const gridQuotes: GridQuote[] = state.quotes
    .filter((q) => q.at <= nowAt)
    .map((q) => ({ delayMs: q.delayMs, sizeUsd: q.sizeUsd, ratio: q.effectivePriceRatio }));
  const grid = buildQuoteGrid(gridQuotes, { quoteLiquidityUsd, spotRatio });
  // Exit depth: the reported pool liquidity, capped by the depth the latest observed quotes actually show.
  const latestDelay = grid.delays.length ? grid.delays[grid.delays.length - 1]! : 0;
  const impliedDepth = grid.impliedDepthUsd(latestDelay);
  const exitLiquidityUsd = impliedDepth !== null ? Math.min(quoteLiquidityUsd, impliedDepth) : quoteLiquidityUsd;

  const sameSide = state.flows.filter((f) => f.at <= nowAt && f.side === trade.side);
  const sortedFlows = [...sameSide].sort((a, b) => a.delayMs - b.delayMs);
  const competingFlowUsd = sortedFlows.reduce((s, f) => s + f.sizeUsd, 0);
  const realizedFlowAt = (delayMs: number) => {
    let s = 0;
    for (const f of sortedFlows) {
      if (f.delayMs > delayMs) break;
      s += f.sizeUsd;
    }
    return s;
  };
  // Observed quotes already reflect realized flow; only the model fallback needs it added.
  const aheadUsdAt = grid.observedCount > 0 ? () => 0 : realizedFlowAt;

  const typicalGainPct = state.profile?.typicalGainPct ?? opts.defaultTypicalGainPct ?? 25;
  const exits = state.sourceExits.filter((e) => e.at <= nowAt);
  const witnessedFraction = Math.min(1, exits.reduce((s, e) => s + e.fractionOfPosition, 0));
  const witnessedSourceExitUsd = exits.reduce((s, e) => s + e.sizeUsd, 0);
  const thesisTarget = 1 + typicalGainPct / 100;
  // Current spot vs source entry from the latest observed quotes (smallest size), else the market snapshot.
  const spotNow = grid.observedCount > 0 ? grid.ratio(latestDelay, 1).value : spotRatio;
  // Alive thesis: exit at the typical target. Source has left: no further upside, exit at what quotes show now.
  const targetRatio = exits.length ? Math.min(thesisTarget, spotNow) : thesisTarget;
  const assumedSourceExitUsd = trade.sizeUsd * targetRatio;
  // Whatever the source has not yet sold is assumed to be sold before the follower exits.
  const sourceExitUsd = (1 - witnessedFraction) * assumedSourceExitUsd;

  const security = state.security;
  const buyTaxPct = security?.buyFeePct ?? 0;
  const sellTaxPct = security?.sellFeePct ?? 0;
  const fixedFeesUsd = trade.feesUsd ?? opts.defaultFixedFeesUsd ?? 0.25;
  const platformFeePct = trade.platformFeesUsd != null && trade.sizeUsd > 0
    ? (trade.platformFeesUsd / trade.sizeUsd) * 100
    : opts.defaultPlatformFeePct ?? 0.5;

  const lastQuoteAt = state.quotes.length ? Math.max(...state.quotes.filter((q) => q.at <= nowAt).map((q) => q.at)) : null;
  const quoteAgeMs = lastQuoteAt === null ? null : nowAt - lastQuoteAt;
  const marketAgeMs = state.market ? nowAt - state.market.observedAt : null;

  const issues: string[] = [];
  if (!state.market) issues.push('No market snapshot: liquidity unknown');
  else if (marketAgeMs !== null && marketAgeMs > policy.marketStaleAfterMs) issues.push('Market snapshot stale');
  if (grid.observedCount === 0) issues.push('No quotes observed: entry prices are model-only');
  else if (grid.observedCount < policy.minObservedQuotes) issues.push('Too few observed quotes');
  if (quoteAgeMs !== null && quoteAgeMs > policy.quoteStaleAfterMs) issues.push('Quotes stale');
  if (!security) issues.push('No security snapshot');
  else if (security.completeness < 0.5) issues.push('Security snapshot incomplete');
  const streamState = state.status?.state ?? 'unknown';
  if (streamState === 'stale' || streamState === 'reconnecting') issues.push(`Stream ${streamState}`);

  const exitConfidence: Confidence = exits.length ? 'observed' : 'projected';

  return {
    inputs: {
      grid,
      aheadUsdAt,
      targetRatio,
      sourceExitUsd,
      exitLiquidityUsd,
      buyTaxPct,
      sellTaxPct,
      platformFeePct,
      fixedFeesUsd,
      exitConfidence,
    },
    quality: {
      observedQuotes: grid.observedCount,
      quoteAgeMs,
      marketAgeMs,
      hasSecurity: !!security,
      securityCompleteness: security?.completeness ?? 0,
      sourceExitWitnessed: exits.length > 0,
      streamState,
      issues,
      degraded: issues.length > 0,
    },
    impliedDepthUsd: impliedDepth,
    spotRatio,
    spotNow,
    realizedFlowAt,
    competingFlowUsd,
    competingFlowCount: sortedFlows.length,
    assumedSourceExitUsd,
    witnessedSourceExitUsd,
  };
}

// ---------------------------------------------------------------------------
// Remaining alpha + CrowdGuard (browser-side)
// ---------------------------------------------------------------------------

export type Decision = 'ALLOW' | 'RESIZE' | 'BLOCK';

export interface Verdict {
  decision: Decision;
  /** Scenario-adjusted outcome for the user's intended order, percent. */
  evPct: number;
  /** Maximum scenario-compatible size (USD) at the user's delay. 0 when none. */
  maxCompatibleUsd: number;
  outcome: Outcome | null;
  capacity: CapacityResult | null;
  confidence: Confidence;
  reasons: string[];
  quality: DataQuality | null;
}

const CRITICAL_FLAGS: (keyof SecuritySnapshot)[] = ['isHoneypot', 'balanceMutable', 'selfDestruct'];

export function remainingAlpha(derived: DerivedInputs, delayMs: number, policy: CrowdGuardPolicy = DEFAULT_POLICY): CapacityResult {
  return solveCapacity(derived.inputs, delayMs, { minSizeUsd: policy.minSizeUsd });
}

export function crowdGuard(state: ScenarioState, intent: UserIntent, policy: CrowdGuardPolicy = DEFAULT_POLICY, nowAt?: number): Verdict {
  const derived = deriveInputs(state, { nowAt, policy });
  if (!derived) {
    return { decision: 'BLOCK', evPct: -100, maxCompatibleUsd: 0, outcome: null, capacity: null, confidence: 'model', reasons: ['No source trade observed'], quality: null };
  }
  const reasons: string[] = [];
  const security = state.security;
  const critical = security ? CRITICAL_FLAGS.filter((k) => security[k] === true) : [];
  if (critical.length) {
    reasons.push(`Critical security flag: ${critical.join(', ')}`);
    return { decision: 'BLOCK', evPct: -100, maxCompatibleUsd: 0, outcome: null, capacity: null, confidence: 'observed', reasons, quality: derived.quality };
  }
  if (!state.market && derived.inputs.grid.observedCount === 0) {
    reasons.push('Neither market liquidity nor quotes observed');
    return { decision: 'BLOCK', evPct: -100, maxCompatibleUsd: 0, outcome: null, capacity: null, confidence: 'model', reasons, quality: derived.quality };
  }

  const outcome = followerOutcome(derived.inputs, intent.delayMs, intent.sizeUsd);
  const capacity = solveCapacity(derived.inputs, intent.delayMs, { minSizeUsd: policy.minSizeUsd });
  const confidence = worstConfidence(outcome.confidence, capacity.confidence);

  let decision: Decision;
  // An order at or below the solved capacity is scenario-compatible by definition, so a
  // "Resize to $X" action always lands on ALLOW instead of chasing floating-point noise.
  if (outcome.evPct >= policy.minEvPct || (capacity.capacityUsd >= policy.minSizeUsd && intent.sizeUsd <= capacity.capacityUsd)) {
    decision = 'ALLOW';
  } else if (capacity.capacityUsd >= policy.minSizeUsd) {
    decision = 'RESIZE';
    reasons.push(`Scenario outcome ${outcome.evPct.toFixed(1)}% below ${policy.minEvPct}% threshold`);
  } else {
    decision = 'BLOCK';
    reasons.push(capacity.capacityUsd === 0 ? 'No order size keeps the scenario outcome positive' : `Compatible size below ${policy.minSizeUsd} USD minimum`);
  }

  // Fail conservative: degraded data can never ALLOW.
  if (decision === 'ALLOW' && derived.quality.degraded) {
    decision = 'RESIZE';
    reasons.push(...derived.quality.issues.map((i) => `Data incomplete: ${i}`));
  }
  if (decision === 'ALLOW' && policy.requireSecurity && !security) {
    decision = 'RESIZE';
    reasons.push('Security snapshot required for ALLOW');
  }
  if (derived.inputs.exitConfidence !== 'observed') reasons.push('Source exit not yet witnessed: full exit at target assumed');
  if (confidence === 'extrapolated') reasons.push('Order size beyond the observed quote grid: impact extrapolated');
  if (confidence === 'model') reasons.push('No quotes observed: constant-product model on reported liquidity');

  return {
    decision,
    evPct: outcome.evPct,
    maxCompatibleUsd: capacity.capacityUsd,
    outcome,
    capacity,
    confidence,
    reasons,
    quality: derived.quality,
  };
}

// ---------------------------------------------------------------------------
// Visualization samplers (pure, deterministic)
// ---------------------------------------------------------------------------

export interface ShadowFollower {
  id: number;
  delayMs: number;
  sizeUsd: number;
}

export interface ShadowOutcome extends ShadowFollower {
  evPct: number;
  confidence: Confidence;
  /** Event-time at which this follower has "entered" (its delay). */
  enteredAt: number;
}

export interface ShadowSamplerOptions {
  count?: number;
  seed?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  minSizeUsd?: number;
  maxSizeUsd?: number;
}

/** 100 sampled (delay, size) scenarios. A visualization of the surface, not agents. */
export function sampleShadowFollowers(opts: ShadowSamplerOptions = {}): ShadowFollower[] {
  const count = opts.count ?? 100;
  const rng = mulberry32(opts.seed ?? 20260904);
  const out: ShadowFollower[] = [];
  const cols = 10;
  const rows = Math.ceil(count / cols);
  const minD = opts.minDelayMs ?? 300;
  const maxD = opts.maxDelayMs ?? 45_000;
  const minS = opts.minSizeUsd ?? 50;
  const maxS = opts.maxSizeUsd ?? 5000;
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    // Stratified jitter so the swarm covers the plane without a visible lattice.
    const dT = (c + rng()) / cols;
    const sT = (r + rng()) / rows;
    out.push({
      id: i,
      delayMs: Math.exp(Math.log(minD) + dT * (Math.log(maxD) - Math.log(minD))),
      sizeUsd: Math.round(Math.exp(Math.log(minS) + sT * (Math.log(maxS) - Math.log(minS)))),
    });
  }
  return out;
}

export function evaluateShadowFollowers(derived: DerivedInputs, followers: ShadowFollower[]): ShadowOutcome[] {
  return followers.map((f) => {
    const o = followerOutcome(derived.inputs, f.delayMs, f.sizeUsd);
    return { ...f, evPct: o.evPct, confidence: o.confidence, enteredAt: f.delayMs };
  });
}

export interface CapacityCurvePoint {
  delayMs: number;
  capacityUsd: number;
  confidence: Confidence;
}

export function capacityCurve(derived: DerivedInputs, delaysMs: number[], policy: CrowdGuardPolicy = DEFAULT_POLICY): CapacityCurvePoint[] {
  return delaysMs.map((d) => {
    const c = solveCapacity(derived.inputs, d, { minSizeUsd: policy.minSizeUsd });
    return { delayMs: d, capacityUsd: c.capacityUsd, confidence: c.confidence };
  });
}

export interface SurfaceCell {
  delayMs: number;
  crowdUsd: number;
  capacityUsd: number;
  confidence: Confidence;
}

/** C(delay, crowd AUM) over a grid, holding the observed quote grid fixed and varying hypothetical crowd. */
export function capacitySurface(derived: DerivedInputs, delaysMs: number[], crowdsUsd: number[], policy: CrowdGuardPolicy = DEFAULT_POLICY): SurfaceCell[] {
  const cells: SurfaceCell[] = [];
  for (const crowdUsd of crowdsUsd) {
    // Hypothetical additional crowd enters ahead of the follower, front-loaded over the first 30s.
    const inputs: ModelInputs = {
      ...derived.inputs,
      aheadUsdAt: (d) => derived.inputs.aheadUsdAt(d) + crowdUsd * Math.min(1, Math.sqrt(d / 30_000)),
    };
    for (const delayMs of delaysMs) {
      const c = solveCapacity(inputs, delayMs, { minSizeUsd: policy.minSizeUsd });
      cells.push({ delayMs, crowdUsd, capacityUsd: c.capacityUsd, confidence: c.confidence });
    }
  }
  return cells;
}

export { logUniform };
