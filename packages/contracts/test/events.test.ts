import { describe, expect, it } from 'vitest';
import { DomainEvent, PROVENANCE_LABEL, ReplayManifest } from '../src';

describe('DomainEvent envelope', () => {
  it('accepts a valid quote.observed event', () => {
    const parsed = DomainEvent.parse({
      v: 1,
      id: 'q-1',
      seq: 3,
      at: 1500,
      sessionId: 's',
      provenance: { kind: 'demo-scenario', source: 'replay' },
      type: 'quote.observed',
      payload: {
        chainId: 'evm:8453',
        tokenIn: '0xa',
        tokenOut: '0xb',
        delayMs: 1500,
        sizeUsd: 1000,
        amountOutUsd: 980,
        effectivePriceRatio: 1.02,
        priceImpactPct: 0.4,
        slippagePct: 0.5,
        feesUsd: 1.2,
        latencyMs: 40,
        quotedAt: 1500,
        source: 'quoting-wss',
      },
    });
    expect(parsed.type).toBe('quote.observed');
  });

  it('rejects an unknown provenance kind', () => {
    const res = DomainEvent.safeParse({
      v: 1, id: 'x', seq: 0, at: 0, sessionId: 's',
      provenance: { kind: 'real-followers', source: 'replay' },
      type: 'scenario.marker', payload: { label: 'x', severity: 'info' },
    });
    expect(res.success).toBe(false);
  });

  it('never labels a fixture as live witnessed', () => {
    expect(PROVENANCE_LABEL['demo-scenario']).toBe('Demo scenario');
    expect(PROVENANCE_LABEL['live-witnessed']).toBe('Live witnessed');
  });

  it('manifest requires a disclosure string', () => {
    const res = ReplayManifest.safeParse({ v: 1, id: 'a', title: 't', description: 'd', provenance: { kind: 'demo-scenario', source: 'replay' }, durationMs: 1, defaultSpeed: 1, eventCount: 0, createdAt: new Date().toISOString() });
    expect(res.success).toBe(false);
  });
});
