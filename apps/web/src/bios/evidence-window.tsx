'use client';
import type { ReplayManifest } from '@second-order/contracts';
import { PROVENANCE_LABEL } from '@second-order/contracts';
import type { DerivedInputs, ScenarioState, Verdict } from '@second-order/core';
import { fmtDelay, fmtPct, fmtUsd, fmtUsdWhole, shortAddress } from '@/lib/format';
import { Win95Button, Win95Dialog } from './win95';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  state: ScenarioState;
  derived: DerivedInputs | null;
  verdict: Verdict | null;
  manifest: ReplayManifest | null;
  intent: { sizeUsd: number; delayMs: number };
  nowAt: number;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-dotted border-[#808080] py-[3px] text-[12.5px]">
      <span className="text-[#333]">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="w95-groove mb-3 px-3 pb-2 pt-1">
      <legend className="px-1 text-[12px] font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Evidence Log: everything a judge needs to trace the verdict back to observations. */
export function EvidenceWindow({ open, onOpenChange, state, derived, verdict, manifest, intent, nowAt }: Props) {
  const grid = derived?.inputs.grid;
  const latestDelay = grid && grid.delays.length ? grid.delays[grid.delays.length - 1]! : null;
  const latestQuotes = latestDelay !== null ? state.quotes.filter((q) => Math.abs(q.delayMs - latestDelay) < 250) : [];
  const sec = state.security;
  const b = verdict?.outcome?.breakdown;
  return (
    <Win95Dialog open={open} onOpenChange={onOpenChange} title={`Evidence Log — T+${(nowAt / 1000).toFixed(1)} s`} width={640}>
      <div className="p-3">
        <div className="w95-inset max-h-[62vh] overflow-y-auto p-3">
          <Group title="Provenance">
            <Row k="Kind" v={manifest ? PROVENANCE_LABEL[manifest.provenance.kind] : '—'} />
            <Row k="Replay" v={manifest?.id ?? '—'} />
            <Row k="Events applied · duplicates dropped" v={`${state.seen.size} · ${state.duplicates}`} />
            {manifest && <p className="mt-2 text-[12px] leading-[1.45] text-[#333]">{manifest.disclosure}</p>}
          </Group>

          <Group title="Verdict inputs (this browser only)">
            <Row k="Intended size · delay" v={`${fmtUsdWhole(intent.sizeUsd)} · ${fmtDelay(intent.delayMs)}`} />
            <Row k="Decision" v={verdict?.decision ?? '—'} />
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
            {verdict?.reasons.length ? <ul className="mt-2 list-disc pl-5 text-[12px] leading-[1.45]">{verdict.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}
          </Group>

          {derived && (
            <Group title="Data quality">
              <Row k="Observed quotes" v={derived.quality.observedQuotes} />
              <Row k="Quote age" v={derived.quality.quoteAgeMs === null ? '—' : fmtDelay(derived.quality.quoteAgeMs)} />
              <Row k="Security completeness" v={`${Math.round(derived.quality.securityCompleteness * 100)}%`} />
              <Row k="Source exit" v={derived.quality.sourceExitWitnessed ? 'witnessed' : 'assumed at target'} />
              <Row k="Stream" v={derived.quality.streamState} />
              {derived.quality.issues.map((i) => <Row key={i} k="Issue" v={i} />)}
            </Group>
          )}

          {state.status?.capabilities && (
            <Group title="Provider capabilities">
              {Object.entries(state.status.capabilities).map(([k, v]) => <Row key={k} k={k} v={v} />)}
              {state.status.message && <p className="mt-2 text-[12px] leading-[1.45] text-[#333]">{state.status.message}</p>}
            </Group>
          )}

          {derived && (
            <Group title="Model inputs">
              <Row k="Exit target ratio" v={derived.inputs.targetRatio.toFixed(4)} />
              <Row k="Source remainder to sell" v={fmtUsdWhole(derived.inputs.sourceExitUsd)} />
              <Row k="Exit depth (min of reported, implied)" v={fmtUsdWhole(derived.inputs.exitLiquidityUsd)} />
              <Row k="Implied depth from quotes" v={derived.impliedDepthUsd ? fmtUsdWhole(derived.impliedDepthUsd) : '—'} />
              <Row k="Spot now vs source" v={derived.spotNow.toFixed(4)} />
              <Row k="Competing flow" v={`${derived.competingFlowCount} trades · ${fmtUsdWhole(derived.competingFlowUsd)}`} />
              <Row k="Platform fee · fixed fees" v={`${derived.inputs.platformFeePct.toFixed(2)}% · ${fmtUsd(derived.inputs.fixedFeesUsd)}`} />
            </Group>
          )}

          <Group title={`Latest quote column${latestDelay !== null ? ` (T+${(latestDelay / 1000).toFixed(1)} s)` : ''}`}>
            {latestQuotes.length ? latestQuotes.map((q) => <Row key={q.quoteRef ?? `${q.delayMs}-${q.sizeUsd}`} k={`${fmtUsdWhole(q.sizeUsd)} · ${q.source}`} v={`ratio ${q.effectivePriceRatio.toFixed(4)} · impact ${q.priceImpactPct?.toFixed(2) ?? '—'}%`} />) : <p className="text-[12px]">No quotes observed yet.</p>}
          </Group>

          <Group title="Security snapshot">
            {sec ? (
              <>
                <Row k="Honeypot · mintable · freezable" v={`${String(sec.isHoneypot)} · ${String(sec.isMintable)} · ${String(sec.isFreezable)}`} />
                <Row k="Buy / sell fee" v={`${sec.buyFeePct ?? '—'}% / ${sec.sellFeePct ?? '—'}%`} />
                <Row k="LP locked · burned" v={`${sec.lpLockedShare !== null ? Math.round(sec.lpLockedShare * 100) : '—'}% · ${sec.liquidityBurnPct ?? '—'}%`} />
                <Row k="Top-10 holdings" v={`${sec.top10HoldingsPct ?? '—'}%`} />
                <Row k="Static analysis" v={sec.staticAnalysisStatus ?? '—'} />
              </>
            ) : <p className="text-[12px]">No security snapshot. ALLOW is impossible without one.</p>}
          </Group>

          <Group title="Competing flow ledger (latest 40)">
            {state.flows.slice().reverse().slice(0, 40).map((f) => <Row key={f.txHash} k={`T+${(f.delayMs / 1000).toFixed(1)} s · ${shortAddress(f.wallet)}`} v={`${f.side.toUpperCase()} ${fmtUsdWhole(f.sizeUsd)}`} />)}
            {state.flows.length === 0 && <p className="text-[12px]">No competing flow observed yet.</p>}
            <p className="mt-2 text-[12px] leading-[1.45] text-[#333]">Same-direction trades by other wallets. They do not prove copy-trading. The source-exit overlap describes timing, not intent.</p>
          </Group>

          <Group title="Assumptions">
            <ul className="list-disc pl-5 text-[12px] leading-[1.5]">
              <li>Entry price interpolated from observed quotes (linear in delay, log in size); beyond the observed envelope a constant-product term is used and marked extrapolated.</li>
              <li>Exit target is the source's typical gain until a source exit is witnessed, then the current observed spot: no further upside is assumed once the source has left.</li>
              <li>The source's unsold remainder is assumed to be sold before the follower exits. Exit depth is the lower of reported liquidity and the depth implied by the latest quotes.</li>
              <li>Missing or stale market, quote or security data can only downgrade the verdict. Critical security flags block regardless of outcome.</li>
              <li>The 100 shadow followers are sampled (delay, size) scenarios evaluated against the same inputs. They are not agents and not real wallets.</li>
            </ul>
          </Group>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Win95Button isDefault onClick={() => onOpenChange(false)}>Close</Win95Button>
        </div>
      </div>
    </Win95Dialog>
  );
}
