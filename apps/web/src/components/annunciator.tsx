'use client';
import type { Verdict } from '@second-order/core';
import { fmtPct, fmtUsdWhole } from '@/lib/format';

interface Props {
  phase: 'armed' | 'connecting' | 'running' | 'ended' | 'failed';
  verdict: Verdict | null;
  intent: { sizeUsd: number; delayMs: number };
  wallet: string | null;
  blocked: boolean;
  progress: number; // 0..1 of the replay
  followersEntered: number;
  competingFlowUsd: number;
  error: string | null;
  onStart: () => void;
  onResize: (usd: number) => void;
  onBlock: () => void;
  onUnblock: () => void;
  onReset: () => void;
  reducedMotion: boolean;
  /** Link to the shareable report for this session (intent travels in the fragment). */
  reportHref?: string | null;
}

const TITLE: Record<Verdict['decision'], string> = {
  ALLOW: 'SCENARIO-COMPATIBLE',
  RESIZE: 'CROWD CAPTURE RISK',
  BLOCK: 'CAPACITY EXHAUSTED',
};

/** The decisive panel. Armed → running → verdict. Colour and title change together. */
export function Annunciator(p: Props) {
  const base = 'relative flex h-full min-h-[132px] flex-col justify-center px-6 py-4 md:px-7';
  const flip = p.reducedMotion ? '' : 'transition-[background-color,border-color] duration-500 ease-out';

  if (p.blocked) {
    return (
      <div className={`${base} ${flip} border-l-4 border-red bg-bg-raised`} role="status" aria-live="polite">
        <div className="text-[13px] font-semibold tracking-[0.04em] text-red">WALLET BLOCKED</div>
        <div className="mt-1 text-[13px] text-fg-muted">Stored in this browser only. CrowdGuard will not evaluate copies of this wallet.</div>
        <div className="mt-3"><button type="button" onClick={p.onUnblock} className="border border-line-strong px-3 py-1.5 text-[13px] hover:border-fg">Unblock</button></div>
      </div>
    );
  }

  if (p.phase === 'failed') {
    return (
      <div className={`${base} border-l-4 border-amber bg-bg-raised`} role="alert">
        <div className="text-[13px] font-semibold tracking-[0.04em] text-amber">REPLAY UNAVAILABLE</div>
        <div className="mt-1 text-[13px] text-fg-muted">{p.error ?? 'The replay could not be loaded.'} No verdict is issued without data.</div>
        <div className="mt-3"><button type="button" onClick={p.onReset} className="border border-line-strong px-3 py-1.5 text-[13px] hover:border-fg">Try again</button></div>
      </div>
    );
  }

  if (p.phase === 'armed' || p.phase === 'connecting') {
    return (
      <div className={`${base} bg-bg-raised`}>
        <button
          type="button"
          onClick={p.onStart}
          disabled={p.phase === 'connecting'}
          className="w-full bg-fg px-4 py-3.5 text-left text-[16px] font-medium text-bg-sunken hover:bg-white disabled:opacity-70"
        >
          {p.phase === 'connecting' ? 'Starting shadow-follower simulation…' : 'Crash test this wallet'}
        </button>
        <div className="mt-2.5 text-[12px] leading-[1.45] text-fg-muted">
          Replays the source trade and evaluates 100 sampled follower scenarios by delay and size. Your {fmtUsdWhole(p.intent.sizeUsd)} at {(p.intent.delayMs / 1000).toFixed(1)} s is checked at the end.
        </div>
      </div>
    );
  }

  if (p.phase === 'running') {
    return (
      <div className={`${base} border-l-4 border-amber bg-bg-raised`} role="status" aria-live="polite">
        <div className="flex items-baseline justify-between">
          <div className="text-[13px] font-semibold tracking-[0.04em] text-amber">EVALUATING</div>
          <div className="font-data text-[12px] text-fg-muted">{Math.round(p.progress * 100)}%</div>
        </div>
        <div className="mt-1.5 h-1 w-full bg-bg-sunken"><div className="h-1 bg-amber" style={{ width: `${Math.round(p.progress * 100)}%`, transition: p.reducedMotion ? 'none' : 'width 200ms linear' }} /></div>
        <div className="font-data mt-2.5 text-[12px] text-fg-muted">
          {p.followersEntered} of 100 shadow followers entered · {fmtUsdWhole(p.competingFlowUsd)} competing flow
        </div>
        {p.verdict && (
          <div className="mt-1 text-[12px] text-fg-muted">
            Live reading for your copy: <span className={`font-data ${p.verdict.evPct >= 0 ? 'text-alpha' : 'text-red'}`}>{fmtPct(p.verdict.evPct, 1)}</span>
          </div>
        )}
      </div>
    );
  }

  const v = p.verdict;
  if (!v) return null;
  const color = v.decision === 'ALLOW' ? 'alpha' : v.decision === 'RESIZE' ? 'red' : 'red';
  const border = color === 'alpha' ? 'border-alpha' : 'border-red';
  const text = color === 'alpha' ? 'text-alpha' : 'text-red';

  return (
    <div className={`${base} ${flip} border-l-4 ${border} bg-bg-raised`} role="status" aria-live="assertive" data-decision={v.decision}>
      <div className="flex items-baseline justify-between">
        <div className={`text-[13px] font-semibold tracking-[0.04em] ${text}`}>{TITLE[v.decision]}</div>
        <div className="flex gap-4">
          {p.reportHref && <a href={p.reportHref} className="text-[12px] text-fg-muted underline-offset-4 hover:text-fg hover:underline">Share report</a>}
          <button type="button" onClick={p.onReset} className="text-[12px] text-fg-muted underline-offset-4 hover:text-fg hover:underline">Run again</button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-[auto_auto] gap-x-8">
        <div>
          <div className="whitespace-nowrap text-[12px] text-fg-muted">{fmtUsdWhole(p.intent.sizeUsd)} scenario outcome</div>
          <div className={`font-data text-[28px] leading-none ${text}`}>{fmtPct(v.evPct, 1)}</div>
        </div>
        <div>
          <div className="whitespace-nowrap text-[12px] text-fg-muted">Max scenario-compatible size</div>
          <div className="font-data text-[28px] leading-none text-fg">{v.maxCompatibleUsd > 0 ? fmtUsdWhole(v.maxCompatibleUsd) : 'none'}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {v.decision !== 'ALLOW' && v.maxCompatibleUsd > 0 && (
          <button type="button" onClick={() => p.onResize(v.maxCompatibleUsd)} className="bg-fg px-3.5 py-2 text-[13px] font-medium text-bg-sunken hover:bg-white">Resize to {fmtUsdWhole(v.maxCompatibleUsd)}</button>
        )}
        {v.decision === 'ALLOW' && <span className="font-data self-center text-[12px] text-fg-muted">estimated, not guaranteed</span>}
        <button type="button" onClick={p.onBlock} className="border border-line-strong px-3.5 py-2 text-[13px] hover:border-fg">Block wallet</button>
      </div>
    </div>
  );
}
