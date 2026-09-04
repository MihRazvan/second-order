'use client';
import * as Dialog from '@radix-ui/react-dialog';
import type { ReplayManifest } from '@second-order/contracts';
import { PROVENANCE_LABEL } from '@second-order/contracts';
import type { DerivedInputs, ScenarioState, Verdict } from '@second-order/core';
import { fmtDelay, fmtPct, fmtUsd, fmtUsdWhole, shortAddress } from '@/lib/format';

interface Props {
  state: ScenarioState;
  derived: DerivedInputs | null;
  verdict: Verdict | null;
  manifest: ReplayManifest | null;
  intent: { sizeUsd: number; delayMs: number };
  nowAt: number;
}

function Row({ k, v, tone }: { k: string; v: React.ReactNode; tone?: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-line py-1.5 text-[13px]">
      <span className="text-fg-muted">{k}</span>
      <span className={`font-data text-right ${tone ?? 'text-fg'}`}>{v}</span>
    </div>
  );
}

/** Everything a technical judge needs to trace the verdict back to observations. */
export function EvidenceDrawer({ state, derived, verdict, manifest, intent, nowAt }: Props) {
  const grid = derived?.inputs.grid;
  const latestDelay = grid && grid.delays.length ? grid.delays[grid.delays.length - 1]! : null;
  const latestQuotes = latestDelay !== null ? state.quotes.filter((q) => Math.abs(q.delayMs - latestDelay) < 250) : [];
  const sec = state.security;
  const b = verdict?.outcome?.breakdown;

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="border border-line-strong px-3.5 py-2 text-[13px] hover:border-fg">Open evidence</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-[560px] overflow-y-auto border-l border-line-strong bg-bg p-6 text-fg outline-none md:p-8" aria-describedby={undefined}>
          <div className="flex items-baseline justify-between">
            <Dialog.Title className="text-[18px] font-medium">Evidence</Dialog.Title>
            <Dialog.Close asChild><button type="button" className="text-[13px] text-fg-muted hover:text-fg">Close</button></Dialog.Close>
          </div>

          <h3 className="mt-6 text-[13px] font-semibold">Provenance</h3>
          <Row k="Kind" v={manifest ? PROVENANCE_LABEL[manifest.provenance.kind] : '—'} tone={manifest?.provenance.kind === 'live-witnessed' ? 'text-alpha' : 'text-amber'} />
          <Row k="Replay" v={manifest?.id ?? '—'} />
          <Row k="Events applied · duplicates dropped" v={`${state.seen.size} · ${state.duplicates}`} />
          {manifest && <p className="mt-2 text-[12px] leading-[1.5] text-fg-muted">{manifest.disclosure}</p>}

          <h3 className="mt-6 text-[13px] font-semibold">Verdict inputs (your browser only)</h3>
          <Row k="Intended size · delay" v={`${fmtUsdWhole(intent.sizeUsd)} · ${fmtDelay(intent.delayMs)}`} />
          <Row k="Decision" v={verdict?.decision ?? '—'} tone={verdict?.decision === 'ALLOW' ? 'text-alpha' : 'text-red'} />
          <Row k="Confidence" v={verdict?.confidence ?? '—'} />
          {b && (
            <>
              <Row k="Entry drift vs source" v={fmtPct(b.entryDriftPct, 2)} />
              <Row k="Entry impact (your size)" v={fmtPct(b.entryImpactPct, 2)} />
              <Row k="Source-exit overlap" v={fmtPct(b.exitOverlapPct, 2)} />
              <Row k="Your exit impact" v={fmtPct(b.exitOwnPct, 2)} />
              <Row k="Taxes · platform · fixed" v={`${fmtPct(b.taxesPct, 2)} · ${fmtPct(b.platformFeesPct, 2)} · ${fmtPct(b.fixedFeesPct, 2)}`} />
            </>
          )}
          {verdict?.reasons.length ? <ul className="mt-2 list-disc pl-5 text-[12px] leading-[1.5] text-fg-muted">{verdict.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}

          <h3 className="mt-6 text-[13px] font-semibold">Data quality</h3>
          {derived && (
            <>
              <Row k="Observed quotes" v={derived.quality.observedQuotes} />
              <Row k="Quote age" v={derived.quality.quoteAgeMs === null ? '—' : fmtDelay(derived.quality.quoteAgeMs)} />
              <Row k="Security completeness" v={`${Math.round(derived.quality.securityCompleteness * 100)}%`} />
              <Row k="Source exit" v={derived.quality.sourceExitWitnessed ? 'witnessed' : 'assumed at target'} tone={derived.quality.sourceExitWitnessed ? 'text-fg' : 'text-amber'} />
              <Row k="Stream" v={derived.quality.streamState} />
              {derived.quality.issues.map((i) => <Row key={i} k="Issue" v={i} tone="text-amber" />)}
            </>
          )}

          <h3 className="mt-6 text-[13px] font-semibold">Model inputs at T+{(nowAt / 1000).toFixed(1)} s</h3>
          {derived && (
            <>
              <Row k="Exit target ratio" v={derived.inputs.targetRatio.toFixed(4)} />
              <Row k="Source remainder to sell" v={fmtUsdWhole(derived.inputs.sourceExitUsd)} />
              <Row k="Exit depth (min of reported, implied)" v={fmtUsdWhole(derived.inputs.exitLiquidityUsd)} />
              <Row k="Implied depth from quotes" v={derived.impliedDepthUsd ? fmtUsdWhole(derived.impliedDepthUsd) : '—'} />
              <Row k="Spot now vs source" v={derived.spotNow.toFixed(4)} />
              <Row k="Competing flow" v={`${derived.competingFlowCount} trades · ${fmtUsdWhole(derived.competingFlowUsd)}`} />
              <Row k="Platform fee · fixed fees" v={`${derived.inputs.platformFeePct.toFixed(2)}% · ${fmtUsd(derived.inputs.fixedFeesUsd)}`} />
            </>
          )}

          <h3 className="mt-6 text-[13px] font-semibold">Latest quote column {latestDelay !== null ? `(T+${(latestDelay / 1000).toFixed(1)} s)` : ''}</h3>
          {latestQuotes.length ? latestQuotes.map((q) => (
            <Row key={q.quoteRef ?? `${q.delayMs}-${q.sizeUsd}`} k={`${fmtUsdWhole(q.sizeUsd)} · ${q.source}`} v={`ratio ${q.effectivePriceRatio.toFixed(4)} · impact ${q.priceImpactPct?.toFixed(2) ?? '—'}%`} />
          )) : <p className="text-[12px] text-fg-muted">No quotes observed yet.</p>}

          <h3 className="mt-6 text-[13px] font-semibold">Security snapshot</h3>
          {sec ? (
            <>
              <Row k="Honeypot · mintable · freezable" v={`${String(sec.isHoneypot)} · ${String(sec.isMintable)} · ${String(sec.isFreezable)}`} />
              <Row k="Buy / sell fee" v={`${sec.buyFeePct ?? '—'}% / ${sec.sellFeePct ?? '—'}%`} />
              <Row k="LP locked · burned" v={`${sec.lpLockedShare !== null ? Math.round(sec.lpLockedShare * 100) : '—'}% · ${sec.liquidityBurnPct ?? '—'}%`} />
              <Row k="Top-10 holdings" v={`${sec.top10HoldingsPct ?? '—'}%`} />
              <Row k="Static analysis" v={sec.staticAnalysisStatus ?? '—'} />
            </>
          ) : <p className="text-[12px] text-amber">No security snapshot. ALLOW is impossible without one.</p>}

          <h3 className="mt-6 text-[13px] font-semibold">Competing flow ledger</h3>
          <div className="max-h-[220px] overflow-y-auto">
            {state.flows.slice().reverse().slice(0, 40).map((f) => (
              <Row key={f.txHash} k={`T+${(f.delayMs / 1000).toFixed(1)} s · ${shortAddress(f.wallet)}`} v={`${f.side.toUpperCase()} ${fmtUsdWhole(f.sizeUsd)}`} />
            ))}
            {state.flows.length === 0 && <p className="text-[12px] text-fg-muted">No competing flow observed yet.</p>}
          </div>
          <p className="mt-2 text-[12px] leading-[1.5] text-fg-muted">Same-direction trades by other wallets. They do not prove copy-trading. The source-exit overlap describes timing, not intent.</p>

          <h3 className="mt-6 text-[13px] font-semibold">Assumptions</h3>
          <ul className="list-disc pl-5 text-[12px] leading-[1.6] text-fg-muted">
            <li>Entry price interpolated from observed quotes (linear in delay, log in size); beyond the observed envelope a constant-product term is used and marked extrapolated.</li>
            <li>Exit target is the source's typical gain until a source exit is witnessed, then the current observed spot: no further upside is assumed once the source has left.</li>
            <li>The source's unsold remainder is assumed to be sold before the follower exits. Exit depth is the lower of reported liquidity and the depth implied by the latest quotes.</li>
            <li>Missing or stale market, quote or security data can only downgrade the verdict. Critical security flags block regardless of outcome.</li>
            <li>The 100 shadow followers are sampled (delay, size) scenarios evaluated against the same inputs. They are not agents and not real wallets.</li>
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
