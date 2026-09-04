'use client';
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_INTENT, DEFAULT_POLICY, type CrowdGuardPolicy, type UserIntent } from '@second-order/core';

/**
 * User-local intent and policy. Persisted in this browser only (localStorage) and never
 * included in any request to the stream service.
 */
const KEY = 'second-order:intent:v1';

interface Stored { intent: UserIntent; policy: CrowdGuardPolicy; extraCrowdUsd: number; blocked: string[] }

const DEFAULTS: Stored = { intent: DEFAULT_INTENT, policy: DEFAULT_POLICY, extraCrowdUsd: 0, blocked: [] };

export function useIntent() {
  const [stored, setStored] = useState<Stored>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Stored>;
        setStored({ ...DEFAULTS, ...parsed, intent: { ...DEFAULTS.intent, ...parsed.intent }, policy: { ...DEFAULTS.policy, ...parsed.policy } });
      }
    } catch { /* stay on defaults */ }
    setHydrated(true);
  }, []);

  const update = useCallback((patch: Partial<Stored> | ((s: Stored) => Partial<Stored>)) => {
    setStored((s) => {
      const next = { ...s, ...(typeof patch === 'function' ? patch(s) : patch) };
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, []);

  return {
    hydrated,
    intent: stored.intent,
    policy: stored.policy,
    extraCrowdUsd: stored.extraCrowdUsd,
    blocked: stored.blocked,
    setSize: (sizeUsd: number) => update((s) => ({ intent: { ...s.intent, sizeUsd: Math.max(1, Math.round(sizeUsd)) } })),
    setDelay: (delayMs: number) => update((s) => ({ intent: { ...s.intent, delayMs: Math.max(100, Math.round(delayMs)) } })),
    setExtraCrowd: (extraCrowdUsd: number) => update({ extraCrowdUsd: Math.max(0, Math.round(extraCrowdUsd)) }),
    setPolicy: (policy: Partial<CrowdGuardPolicy>) => update((s) => ({ policy: { ...s.policy, ...policy } })),
    block: (wallet: string) => update((s) => ({ blocked: s.blocked.includes(wallet) ? s.blocked : [...s.blocked, wallet] })),
    unblock: (wallet: string) => update((s) => ({ blocked: s.blocked.filter((w) => w !== wallet) })),
    reset: () => update(DEFAULTS),
  };
}
