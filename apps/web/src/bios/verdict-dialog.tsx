'use client';
import type { Verdict } from '@second-order/core';
import { fmtDelay, fmtPct, fmtUsdWhole } from '@/lib/format';
import { OkIcon, StopIcon, WarnIcon, Win95Button, Win95Dialog } from './win95';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  verdict: Verdict;
  intent: { sizeUsd: number; delayMs: number };
  remainingUsd: number | null;
  onResize: (usd: number) => void;
  onBlock: () => void;
  onEvidence: () => void;
  reportHref: string | null;
}

/** CrowdGuard, delivered the way a 1995 utility delivered bad news: a modal you must read. */
export function VerdictDialog(p: Props) {
  const v = p.verdict;
  const security = v.decision === 'BLOCK' && v.reasons.some((r) => r.startsWith('Critical security flag'));
  const title = v.decision === 'ALLOW' ? 'CrowdGuard — scenario-compatible' : v.decision === 'RESIZE' ? 'CrowdGuard — crowd capture risk' : security ? 'CrowdGuard — security block' : 'CrowdGuard — capacity exhausted';
  const headline = v.decision === 'ALLOW'
    ? `ALLOW — ${fmtUsdWhole(p.intent.sizeUsd)} at ${fmtDelay(p.intent.delayMs)} stays scenario-compatible.`
    : v.decision === 'RESIZE'
      ? `RESIZE — do not copy at ${fmtUsdWhole(p.intent.sizeUsd)}.`
      : `BLOCK — do not copy this trade.`;
  const body = v.decision === 'ALLOW'
    ? `Scenario-adjusted outcome ${fmtPct(v.evPct, 1)}. Remaining alpha ${p.remainingUsd !== null ? fmtUsdWhole(p.remainingUsd) : '—'} at your delay. Estimated, not guaranteed.`
    : v.decision === 'RESIZE'
      ? `Scenario-adjusted outcome for ${fmtUsdWhole(p.intent.sizeUsd)} is ${fmtPct(v.evPct, 1)}. Remaining alpha at your ${fmtDelay(p.intent.delayMs)} delay is ${p.remainingUsd !== null ? fmtUsdWhole(p.remainingUsd) : '—'}. Maximum scenario-compatible size: ${fmtUsdWhole(v.maxCompatibleUsd)}.`
      : security
        ? `${v.reasons[0] ?? 'A critical security flag is set on this token.'} No order size is scenario-compatible.`
        : `Remaining alpha reached ${p.remainingUsd !== null ? fmtUsdWhole(p.remainingUsd) : '$0'} at your ${fmtDelay(p.intent.delayMs)} delay. ${v.reasons[0] ?? ''} Maximum scenario-compatible size: none.`;

  return (
    <Win95Dialog open={p.open} onOpenChange={p.onOpenChange} title={title} width={560} describedBy="verdict-body">
      <div className="p-4" data-decision={v.decision}>
        <div className="flex gap-4">
          <div className="shrink-0 pt-1">{v.decision === 'ALLOW' ? <OkIcon /> : v.decision === 'RESIZE' ? <WarnIcon /> : <StopIcon />}</div>
          <div className="min-w-0">
            <p className="text-[15px] font-bold leading-snug">{headline}</p>
            <p id="verdict-body" className="mt-2 text-[13px] leading-[1.45]">{body}</p>
            {v.reasons.length > 1 && (
              <ul className="mt-2 list-disc pl-5 text-[12px] leading-[1.4] text-[#333]">
                {v.reasons.slice(v.decision === 'BLOCK' && security ? 1 : 0, 4).map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {v.decision === 'RESIZE' && v.maxCompatibleUsd > 0 && <Win95Button isDefault onClick={() => { p.onResize(v.maxCompatibleUsd); p.onOpenChange(false); }}>Resize to {fmtUsdWhole(v.maxCompatibleUsd)}</Win95Button>}
          <Win95Button onClick={() => { p.onOpenChange(false); p.onEvidence(); }}>Show evidence</Win95Button>
          {p.reportHref && <a href={p.reportHref} className="w95-btn inline-block text-center no-underline">Share report</a>}
          {v.decision !== 'ALLOW' && <Win95Button onClick={() => { p.onBlock(); p.onOpenChange(false); }}>Block wallet</Win95Button>}
          <Win95Button disabled={v.decision !== 'ALLOW'} ariaLabel={v.decision !== 'ALLOW' ? 'Copy anyway (disabled: not scenario-compatible)' : undefined}>Copy anyway</Win95Button>
          <Win95Button isDefault={v.decision !== 'RESIZE'} onClick={() => p.onOpenChange(false)}>OK</Win95Button>
        </div>
      </div>
    </Win95Dialog>
  );
}
