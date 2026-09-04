import { describe, expect, it } from 'vitest';
import { ReplayFile } from '@second-order/contracts';
import { crowdGuard, initialScenarioState, reduceScenario, DEFAULT_INTENT, DEFAULT_POLICY, deriveInputs, remainingAlpha } from '@second-order/core';
import { generateDemo } from '../src/generate';
import { DEMO_REPLAY_ID, listReplays, loadReplay } from '../src';

describe('demo fixture', () => {
  it('generator output matches the committed fixture', () => {
    const generated = generateDemo();
    const committed = loadReplay(DEMO_REPLAY_ID)!;
    expect(committed.events.length).toBe(generated.events.length);
    expect(committed.events.map((e) => e.id)).toEqual(generated.events.map((e) => e.id));
  });

  it('is labelled Demo scenario and never live witnessed', () => {
    const file = loadReplay(DEMO_REPLAY_ID)!;
    expect(file.manifest.provenance.kind).toBe('demo-scenario');
    expect(file.events.every((e) => e.provenance.kind === 'demo-scenario')).toBe(true);
    expect(file.manifest.disclosure.toLowerCase()).toContain('synthetic');
    expect(listReplays().map((m) => m.id)).toContain(DEMO_REPLAY_ID);
  });

  it('validates against the contracts and has unique ids', () => {
    const file = ReplayFile.parse(loadReplay(DEMO_REPLAY_ID));
    expect(new Set(file.events.map((e) => e.id)).size).toBe(file.events.length);
    for (let i = 1; i < file.events.length; i++) expect(file.events[i]!.at).toBeGreaterThanOrEqual(file.events[i - 1]!.at);
  });

  it('reproduces the brief numbers from events alone', () => {
    const file = loadReplay(DEMO_REPLAY_ID)!;
    let s = initialScenarioState();
    for (const e of file.events.filter((e) => e.at === 0)) s = reduceScenario(s, e);
    const start = remainingAlpha(deriveInputs(s, { nowAt: 0 })!, DEFAULT_INTENT.delayMs, DEFAULT_POLICY);
    expect(start.capacityUsd).toBeGreaterThanOrEqual(13_800);
    expect(start.capacityUsd).toBeLessThanOrEqual(14_600);
    for (const e of file.events) s = reduceScenario(s, e);
    const end = crowdGuard(s, DEFAULT_INTENT, DEFAULT_POLICY, file.manifest.durationMs);
    expect(end.decision).toBe('RESIZE');
    expect(end.evPct).toBeGreaterThanOrEqual(-13.4);
    expect(end.evPct).toBeLessThanOrEqual(-11.4);
    expect(end.maxCompatibleUsd).toBeGreaterThanOrEqual(74);
    expect(end.maxCompatibleUsd).toBeLessThanOrEqual(94);
  });
});
