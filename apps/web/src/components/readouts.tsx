'use client';
import type { ScenarioState, Verdict } from '@second-order/core';
import { fmtPct, fmtUsdWhole, shortAddress } from '@/lib/format';

interface Props {
  state: ScenarioState;
  remainingUsd: number | null;
  startAlphaUsd: number;
  verdict: Verdict | null;
  intent: { sizeUsd: number; delayMs: number };
  phase: 'armed' | 'connecting' | 'running' | 'ended' | 'failed';
}

function tone(v: number, start: number) {
  if (v > start * 0.5) return 'text-alpha';
  if (v > start * 0.1) return 'text-amber';
  return 'text-red';
}

/** The story in one strip: what the wallet made · what is left · what you would get. */
export function Readouts({ state, remainingUsd, startAlphaUsd, verdict, intent, phase }: Props) {
  const trade = state.sourceTrade;
  const profile = state.profile;
  const armed = phase === 'armed' || phase === 'connecting';
  const ev = verdict?.evPct ?? null;
  const evTone = ev === null ? 'text-fg-faint' : ev >= 0 ? 'text-alpha' : ev > -2 ? 'text-amber' : 'text-red';

  return (
    <>
      <div className="px-6 py-4 md:px-8">
        <div className="flex items-baseline justify-between text-[12px] text-fg-muted">
          <span>Tracked wallet</span>
          <span className="font-data">{trade ? shortAddress(trade.wallet) : '—'}</span>
        </div>
        <div className="font-data mt-1 text-[36px] leading-none text-alpha">{profile ? fmtPct(profile.realizedRatePct, Math.abs(profile.realizedRatePct) < 10 ? 1 : 0) : '—'}</div>
        <div className="mt-1.5 text-[12px] text-fg-muted">
          {profile ? `realized over ${profile.periodDays} days · ${profile.tradeCount} trades` : 'loading profile'}
          {trade && <> · <span className="font-data text-fg">{trade.side.toUpperCase()} {trade.token.symbol} {fmtUsdWhole(trade.sizeUsd)}</span></>}
        </div>
      </div>

      <div className="px-6 py-4 md:px-8">
        <div className="text-[12px] text-fg-muted">Remaining Alpha</div>
        <div className={`font-data mt-1 text-[36px] leading-none ${remainingUsd === null ? 'text-fg-faint' : armed ? 'text-alpha' : tone(remainingUsd, startAlphaUsd)}`}>
          {remainingUsd === null ? '—' : fmtUsdWhole(remainingUsd)}
        </div>
        <div className="mt-1.5 text-[12px] text-fg-muted">
          {armed ? 'estimated before the test · ' : `of ${fmtUsdWhole(startAlphaUsd)} estimated · `}at your {(intent.delayMs / 1000).toFixed(1)} s delay
        </div>
      </div>

      <div className="px-6 py-4 md:px-8">
        <div className="text-[12px] text-fg-muted">Your {fmtUsdWhole(intent.sizeUsd)} copy at {(intent.delayMs / 1000).toFixed(1)} s</div>
        <div className={`font-data mt-1 text-[36px] leading-none ${armed ? 'text-fg-faint' : evTone}`}>{ev === null || armed ? '—' : fmtPct(ev, 1)}</div>
        <div className="mt-1.5 text-[12px] text-fg-muted">{armed ? 'scenario-adjusted outcome, once the test runs' : 'scenario-adjusted outcome · size and delay stay in this browser'}</div>
      </div>
    </>
  );
}
