import type { Frame } from '@/lib/demo-snapshot';
import { fmtPct, fmtUsdWhole, shortAddress } from '@/lib/format';

/** Facts every direction must show identically. Pulled from the same frames. */
export function facts(f: { armed: Frame; end: Frame }) {
  const trade = f.end.state.sourceTrade!;
  const profile = f.end.state.profile!;
  const exit = f.end.state.sourceExits[0];
  return {
    wallet: trade.wallet,
    walletShort: shortAddress(trade.wallet),
    roi: fmtPct(profile.realizedRatePct, 0),
    periodDays: profile.periodDays,
    trades: profile.tradeCount,
    winRate: profile.winRatePct,
    token: trade.token.symbol,
    quote: trade.quoteToken.symbol,
    chain: 'Base',
    sourceSize: fmtUsdWhole(trade.sizeUsd),
    startAlpha: fmtUsdWhole(f.armed.remainingUsd),
    startAlphaUsd: f.armed.remainingUsd,
    endAlpha: fmtUsdWhole(f.end.remainingUsd),
    endAlphaUsd: f.end.remainingUsd,
    userSize: fmtUsdWhole(1000),
    userEv: fmtPct(f.end.verdict.evPct, 1),
    userEvPct: f.end.verdict.evPct,
    maxCompatible: fmtUsdWhole(f.end.verdict.maxCompatibleUsd),
    maxCompatibleUsd: f.end.verdict.maxCompatibleUsd,
    competingFlow: fmtUsdWhole(f.end.derived.competingFlowUsd),
    competingCount: f.end.derived.competingFlowCount,
    depthStart: fmtUsdWhole((f.armed.state.market?.liquidityUsd ?? 0) / 2),
    depthEnd: f.end.derived.impliedDepthUsd ? fmtUsdWhole(f.end.derived.impliedDepthUsd) : '—',
    exitFraction: exit ? Math.round(exit.fractionOfPosition * 100) : null,
    exitAtS: exit ? Math.round(exit.delayMs / 1000) : null,
    exitRatio: exit ? fmtPct((exit.priceRatioVsEntry - 1) * 100, 0) : null,
    decision: f.end.verdict.decision,
    provenance: 'Demo scenario',
  };
}

export type Facts = ReturnType<typeof facts>;
