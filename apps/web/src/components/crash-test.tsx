'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PROVENANCE_LABEL } from '@second-order/contracts';
import {
  capacityCurve,
  crowdGuard,
  deriveInputs,
  evaluateShadowFollowers,
  remainingAlpha,
  sampleShadowFollowers,
  solveCapacity,
  type CapacityCurvePoint,
  type ModelInputs,
} from '@second-order/core';
import { fmtDelay, fmtPct, fmtUsdWhole, shortAddress } from '@/lib/format';
import { useEventClock, useSession } from '@/lib/use-session';
import { useIntent } from '@/lib/use-intent';
import { EvidenceWindow } from '@/bios/evidence-window';
import { HelpPanel } from '@/bios/help-panel';
import { KeyLegend, Panel, toneClass, toneForEv, toneForLevel, type Tone } from '@/bios/primitives';
import { AlphaMeter, CapacityMap, FlowAndDepth, FollowerGrid } from '@/bios/recorder-bios';
import { SettingsList, type Readout, type SettingItem } from '@/bios/settings-list';
import { VerdictDialog } from '@/bios/verdict-dialog';

const GRID_COLS = 20;
const SHADOWS = sampleShadowFollowers({ cols: GRID_COLS });
const CURVE_DELAYS = [300, 500, 800, 1200, 2000, 3000, 5000, 8000, 12000, 20000, 30000, 45000];
const CHAINS: [string, string][] = [['', 'ANY CHAIN'], ['evm:8453', 'BASE'], ['evm:1', 'ETHEREUM'], ['evm:42161', 'ARBITRUM'], ['evm:56', 'BNB CHAIN'], ['solana:solana', 'SOLANA']];
const WINDOWS = [120, 300, 900, 1800];
const CHAIN_NAME: Record<string, string> = { 'evm:8453': 'BASE', 'evm:1': 'ETHEREUM', 'evm:42161': 'ARBITRUM', 'evm:56': 'BNB CHAIN', 'evm:137': 'POLYGON', 'evm:10': 'OPTIMISM', 'solana:solana': 'SOLANA' };
const WALLET_RE = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;
const COL_LABELS = ['.3s', '', '.5s', '', '1s', '', '2s', '', '3s', '', '5s', '', '9s', '', '15s', '', '27s', '', '45s', ''];
const SPINNER = ['|', '/', '-', '\\'];

function useReducedMotion() {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setRm(mq.matches);
    const fn = (e: MediaQueryListEvent) => setRm(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return rm;
}

export function CrashTest() {
  const { snap, store } = useSession();
  const clock = useEventClock(snap, 12);
  const intentApi = useIntent();
  const reducedMotion = useReducedMotion();
  const { intent, policy, extraCrowdUsd } = intentApi;

  const live = snap.liveTarget?.mode === 'live';
  const durationMs = live ? Math.max(120_000, Math.ceil((snap.eventTime + 1) / 60_000) * 60_000) : snap.manifest?.durationMs ?? 60_000;
  const armed = snap.phase === 'armed' || snap.phase === 'connecting';
  const running = snap.phase === 'running';
  const nowAt = armed ? 0 : live ? snap.eventTime : Math.min(clock, durationMs);

  const derived = useMemo(() => deriveInputs(snap.state, { nowAt, policy }), [snap.state, nowAt, policy]);
  const verdict = useMemo(() => (snap.state.sourceTrade ? crowdGuard(snap.state, intent, policy, nowAt) : null), [snap.state, intent, policy, nowAt]);
  const remainingUsd = useMemo(() => (derived ? remainingAlpha(derived, intent.delayMs, policy).capacityUsd : null), [derived, intent.delayMs, policy]);
  const shadows = useMemo(() => (derived ? evaluateShadowFollowers(derived, SHADOWS) : SHADOWS.map((s) => ({ ...s, evPct: 0, confidence: 'model' as const, enteredAt: s.delayMs }))), [derived]);
  const curve = useMemo<CapacityCurvePoint[]>(() => {
    if (!derived) return [];
    if (extraCrowdUsd <= 0) return capacityCurve(derived, CURVE_DELAYS, policy);
    const inputs: ModelInputs = { ...derived.inputs, aheadUsdAt: (d) => derived.inputs.aheadUsdAt(d) + extraCrowdUsd * Math.min(1, Math.sqrt(d / 30_000)) };
    return CURVE_DELAYS.map((d) => { const c = solveCapacity(inputs, d, { minSizeUsd: policy.minSizeUsd }); return { delayMs: d, capacityUsd: c.capacityUsd, confidence: c.confidence }; });
  }, [derived, extraCrowdUsd, policy]);

  // Start estimate frozen per session once the market snapshot is in.
  const startRef = useRef<{ key: string; value: number } | null>(null);
  const sessionKey = `${snap.session?.sessionId ?? 'armed'}:${snap.manifest?.id ?? ''}`;
  if (startRef.current && startRef.current.key !== sessionKey) startRef.current = null;
  if (remainingUsd !== null && snap.state.sourceTrade && snap.state.market && (armed || !startRef.current)) startRef.current = { key: sessionKey, value: remainingUsd };
  const startAlphaUsd = startRef.current?.value ?? remainingUsd ?? 0;

  // ---- BIOS interaction state ----------------------------------------------
  const [tab, setTab] = useState<'main' | 'target'>('main');
  const [selectedId, setSelectedId] = useState('size');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [verdictOpen, setVerdictOpen] = useState(false);
  const shownFor = useRef<string | null>(null);
  const [target, setTarget] = useState({ wallet: '', chainId: 'evm:8453', windowSeconds: 300, tradeIndex: 0 });
  const [tick, setTick] = useState(0);
  const [escArmed, setEscArmed] = useState(false);
  const escTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!running || reducedMotion) return; const id = setInterval(() => setTick((t) => t + 1), 250); return () => clearInterval(id); }, [running, reducedMotion]);

  // The CrowdGuard dialog opens once per finished session.
  useEffect(() => {
    if (snap.phase === 'ended' && verdict && shownFor.current !== sessionKey) { shownFor.current = sessionKey; setVerdictOpen(true); }
    if (snap.phase !== 'ended') shownFor.current = null;
  }, [snap.phase, verdict, sessionKey]);

  const wallet = snap.state.sourceTrade?.wallet ?? null;
  const blocked = !!wallet && intentApi.blocked.includes(wallet);
  const trade = snap.state.sourceTrade;
  const profile = snap.state.profile;
  const prov = snap.manifest?.provenance.kind ?? null;
  const provTone: Tone = prov === 'live-witnessed' ? 'green' : prov === 'estimated-reconstruction' ? 'cyan' : 'yellow';
  const reportHref = snap.session && snap.transport === 'stream-sse' ? `/report/${snap.session.sessionId}#size=${intent.sizeUsd}&delay=${intent.delayMs}` : null;
  const busy = running || snap.phase === 'connecting';

  const sizeStep = (s: number) => (s < 200 ? 10 : s < 1000 ? 50 : s < 5000 ? 100 : 500);
  const replayIds = snap.replays.map((r) => r.id);
  const replayIdx = Math.max(0, replayIds.indexOf(snap.manifest?.id ?? ''));

  const items: SettingItem[] = [
    {
      id: 'replay', label: 'REPLAY', kind: 'enum', disabled: busy,
      value: snap.manifest ? snap.manifest.title.toUpperCase().slice(0, 34) : 'LOADING',
      onDelta: (d) => { if (replayIds.length) void store.selectReplay(replayIds[(replayIdx + d + replayIds.length) % replayIds.length]!); },
      help: ['Which recording the utility runs. The demo scenario is a calibrated synthetic fixture. Entries marked REAL are estimated reconstructions from Mobula history.', 'Press +/− to cycle, F5 to run.'],
    },
    { id: 'wallet', label: 'SOURCE WALLET', kind: 'readonly', value: trade ? shortAddress(trade.wallet) : '—', help: ['The tracked wallet whose trade is being crash-tested. Its historical return is the leaderboard number a copier would see.', 'A profitable source is not necessarily profitable to copy.'] },
    { id: 'chain', label: 'CHAIN · TRADE', kind: 'readonly', value: trade ? `${CHAIN_NAME[trade.chainId] ?? trade.chainId} · ${trade.side.toUpperCase()} ${trade.token.symbol} ${fmtUsdWhole(trade.sizeUsd)}` : '—', help: ['The source trade the shadow followers copy: chain, side, token and size.'] },
    { id: 'provenance', label: 'PROVENANCE', kind: 'readonly', tone: provTone, value: prov ? PROVENANCE_LABEL[prov].toUpperCase() : '—', help: ['DEMO SCENARIO: synthetic fixture, nothing captured from a market.', 'ESTIMATED RECONSTRUCTION: trades and prices fetched from Mobula history after the fact; quotes inferred from the price path and current depth.', 'LIVE WITNESSED: captured from Mobula streams while it happened. Requires a Growth-plan key.'] },
    { id: 'size', label: 'INTENDED SIZE', kind: 'number', value: fmtUsdWhole(intent.sizeUsd), onDelta: (d) => intentApi.setSize(intent.sizeUsd + d * sizeStep(intent.sizeUsd)), onEdit: (raw) => { const n = Number(raw.replace(/[^0-9.]/g, '')); if (n > 0) intentApi.setSize(n); }, help: ['The capital YOU intend to copy this wallet with.', 'Reduced in your browser. Never transmitted.', 'Raising this value lowers the surviving alpha for every follower, including you.'] },
    { id: 'delay', label: 'FOLLOWER DELAY', kind: 'number', value: `${(intent.delayMs / 1000).toFixed(1)} SEC`, onDelta: (d) => intentApi.setDelay(Math.min(45_000, Math.max(300, intent.delayMs * (d > 0 ? 1.25 : 0.8)))), onEdit: (raw) => { const s = Number(raw); if (s > 0) intentApi.setDelay(s * 1000); }, help: ['How many seconds behind the source your copy lands. Alerts, signing and inclusion add up.', 'Late entries pay the drift and impact of everyone ahead of them.'] },
    { id: 'crowd', label: 'ADDITIONAL CROWD AUM', kind: 'number', value: extraCrowdUsd ? `+${fmtUsdWhole(extraCrowdUsd)}` : 'NONE', onDelta: (d) => intentApi.setExtraCrowd(Math.max(0, extraCrowdUsd + d * 500)), onEdit: (raw) => intentApi.setExtraCrowd(Number(raw.replace(/[^0-9.]/g, '')) || 0), help: ['Hypothetical same-direction capital entering ahead of you, on top of the flow actually observed.', 'Moves the CAPACITY MAP: C(delay, crowd AUM).'] },
    { id: 'target', label: 'TARGET WALLET', kind: 'text', value: target.wallet ? shortAddress(target.wallet) : '', placeholder: 'type an address, ⏎', disabled: busy || !snap.reconstructionAvailable, onEdit: (raw) => setTarget((t) => ({ ...t, wallet: raw.trim() })), help: ['Crash-test any wallet. The utility anchors on its most recent buy that is at least one WINDOW old and reconstructs the minutes after it from Mobula history.', snap.reconstructionAvailable ? 'Press F6 to reconstruct.' : 'Stream service unreachable: reconstruction unavailable.'] },
    { id: 'targetChain', label: 'TARGET CHAIN', kind: 'enum', disabled: busy, value: CHAINS.find(([id]) => id === target.chainId)?.[1] ?? 'ANY CHAIN', onDelta: (d) => setTarget((t) => { const i = CHAINS.findIndex(([id]) => id === t.chainId); return { ...t, chainId: CHAINS[(i + d + CHAINS.length) % CHAINS.length]![0] }; }), help: ['Restricts the reconstruction to buys on one chain.'] },
    { id: 'window', label: 'WINDOW', kind: 'enum', disabled: busy, value: `${target.windowSeconds / 60} MIN`, onDelta: (d) => setTarget((t) => { const i = WINDOWS.indexOf(t.windowSeconds); return { ...t, windowSeconds: WINDOWS[(i + d + WINDOWS.length) % WINDOWS.length]! }; }), help: ['How many minutes after the source buy to reconstruct. Replayed in about fifteen seconds regardless of length.'] },
    { id: 'whichBuy', label: 'WHICH BUY', kind: 'enum', disabled: busy, value: target.tradeIndex === 0 ? 'LATEST' : `${target.tradeIndex} BEFORE`, onDelta: (d) => setTarget((t) => ({ ...t, tradeIndex: Math.max(0, Math.min(4, t.tradeIndex + d)) })), help: ['Anchor on an earlier eligible buy of the target wallet.'] },
  ];

  const ev = verdict?.evPct ?? null;
  const decisionText = blocked ? 'WALLET BLOCKED (LOCAL)' : armed ? 'STANDBY — PRESS F5' : running ? `EVALUATING ${SPINNER[tick % 4]}` : verdict ? `** ${verdict.decision} **` : '—';
  const decisionTone: Tone = blocked ? 'red' : armed ? 'fg' : running ? 'yellow' : verdict?.decision === 'ALLOW' ? 'green' : 'red';
  const readouts: Readout[] = [
    { id: 'r-source', label: 'SOURCE RETURN', value: profile ? `${fmtPct(profile.realizedRatePct, Math.abs(profile.realizedRatePct) < 10 ? 1 : 0)} · ${profile.periodDays}D · ${profile.tradeCount} TRADES` : '—', tone: 'green', help: ['Realized return of the source wallet over the period, from Mobula wallet analysis. This is what a leaderboard shows.'] },
    { id: 'r-alpha', label: 'REMAINING ALPHA', value: remainingUsd === null ? '—' : `${fmtUsdWhole(remainingUsd)} OF ${fmtUsdWhole(startAlphaUsd)}`, tone: remainingUsd === null ? 'dim' : armed ? 'green' : toneForLevel(remainingUsd, startAlphaUsd), help: ['C(delay, crowd): the largest additional order that still has a positive scenario-adjusted outcome at your delay, given the flow already observed.', 'Drains as competing flow enters, execution depth thins and the source exits.'] },
    { id: 'r-follower', label: 'FOLLOWER RETURN', value: ev === null || armed ? '—' : fmtPct(ev, 1), tone: ev === null || armed ? 'dim' : toneForEv(ev), help: ['Scenario-adjusted outcome of YOUR copy: entry behind the crowd, exit after the source, taxes and fees.', 'Estimated. Never a guarantee.'] },
    { id: 'r-verdict', label: 'CROWDGUARD VERDICT', value: decisionText, tone: decisionTone, help: ['ALLOW: your size is at or below the surviving capacity.', 'RESIZE: a smaller order remains scenario-compatible.', 'BLOCK: no size survives, or a critical security flag is set.', 'Stale or missing data can only downgrade the verdict.'] },
    { id: 'r-stream', label: 'STREAM', value: `${snap.transport === 'browser-replay' ? 'LOCAL REPLAY' : snap.transport === 'none' ? 'CONNECTING' : snap.connection === 'stale' ? 'STALE' : snap.connection === 'reconnecting' ? 'RECONNECTING' : 'STREAM'} ${snap.speed}× · T+${(nowAt / 1000).toFixed(1)}S`, tone: snap.connection === 'stale' || snap.connection === 'reconnecting' ? 'yellow' : 'fg', help: ['Transport and freshness. STREAM: events over SSE from the stream service. LOCAL REPLAY: the bundled fixture played in this browser because the service was unreachable.', 'A stale stream can never produce ALLOW.'] },
  ];

  const TARGET_IDS = ['target', 'targetChain', 'window', 'whichBuy'];
  const visibleItems = items.filter((i) => (tab === 'target' ? TARGET_IDS.includes(i.id) : !TARGET_IDS.includes(i.id)));
  const visibleReadouts = tab === 'main' ? readouts : [];
  const allIds = [...visibleItems.map((i) => i.id), ...visibleReadouts.map((r) => r.id)];
  const selectedItem = items.find((i) => i.id === selectedId);
  const selectedReadout = readouts.find((r) => r.id === selectedId);
  const help = selectedItem ? { title: selectedItem.label, lines: selectedItem.help } : selectedReadout ? { title: selectedReadout.label, lines: selectedReadout.help } : { title: '', lines: [] };

  const canReconstruct = snap.reconstructionAvailable && WALLET_RE.test(target.wallet) && !busy;
  const run = useCallback(() => { if (!busy && !blocked) void store.start(); }, [busy, blocked, store]);
  const reconstruct = useCallback(() => { if (canReconstruct) void store.start({ mode: 'reconstruction', wallet: target.wallet, chainId: target.chainId || undefined, windowSeconds: target.windowSeconds, tradeIndex: target.tradeIndex }); }, [canReconstruct, store, target]);
  const reset = useCallback(() => { setVerdictOpen(false); setEvidenceOpen(false); void store.reset(); }, [store]);

  // Keyboard: the utility's real navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (editingId || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) return;
      if (evidenceOpen || verdictOpen) return; // dialogs own the keyboard
      const idx = allIds.indexOf(selectedId);
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); setSelectedId(allIds[Math.min(allIds.length - 1, idx + 1)]!); break;
        case 'ArrowUp': e.preventDefault(); setSelectedId(allIds[Math.max(0, idx - 1)]!); break;
        case '+': case '=': case 'ArrowRight': e.preventDefault(); if (selectedItem?.onDelta && !selectedItem.disabled) selectedItem.onDelta(1); break;
        case '-': case '_': case 'ArrowLeft': e.preventDefault(); if (selectedItem?.onDelta && !selectedItem.disabled) selectedItem.onDelta(-1); break;
        case 'Enter': if (selectedItem && (selectedItem.kind === 'text' || selectedItem.kind === 'number') && !selectedItem.disabled) { e.preventDefault(); setEditingId(selectedItem.id); } break;
        case 'F2': e.preventDefault(); setTab((t) => { const next = t === 'main' ? 'target' : 'main'; setSelectedId(next === 'target' ? 'target' : 'size'); return next; }); break;
        case 'F5': e.preventDefault(); if (armed) run(); else if (!busy) reset(); break;
        case 'F6': e.preventDefault(); reconstruct(); break;
        case 'F8': e.preventDefault(); if (wallet) (blocked ? intentApi.unblock(wallet) : intentApi.block(wallet)); break;
        case 'F9': e.preventDefault(); setEvidenceOpen(true); break;
        case 'F10': e.preventDefault(); if (reportHref) window.location.assign(reportHref); break;
        case 'Escape': {
          // Dialogs close on Escape at the document level before this runs, so a single
          // Escape is never a reset: the first press arms, a second within two seconds resets.
          if (snap.phase === 'armed') return;
          e.preventDefault();
          if (escArmed) { setEscArmed(false); reset(); }
          else { setEscArmed(true); if (escTimer.current) clearTimeout(escTimer.current); escTimer.current = setTimeout(() => setEscArmed(false), 2000); }
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allIds, selectedId, selectedItem, editingId, evidenceOpen, verdictOpen, run, reconstruct, reset, reportHref, wallet, blocked, intentApi, snap.phase, armed, busy, escArmed]);

  const lastMarker = snap.state.markers.filter((m) => m.at <= nowAt).at(-1);
  const statusLine = escArmed ? 'PRESS ESC AGAIN TO RESET THE UTILITY, OR ANY OTHER KEY TO KEEP THIS RUN.' : snap.phase === 'failed'
    ? `ERROR: ${snap.error ?? 'replay unavailable'} — no verdict without data`
    : armed ? (blocked ? 'THIS WALLET IS BLOCKED IN THIS BROWSER. F8 TO UNBLOCK.' : 'READY. F5 RUNS THE SHADOW-FOLLOWER SIMULATION OVER THE RECORDED SOURCE TRADE.')
      : running ? (lastMarker ? `T+${(lastMarker.at / 1000).toFixed(0)}S ${lastMarker.label.toUpperCase()}` : 'SHADOW FOLLOWERS BOARDING…')
        : verdict ? (verdict.decision === 'ALLOW' ? `YOUR SIZE ${fmtUsdWhole(intent.sizeUsd)} FITS SURVIVING CAPACITY AT ${fmtDelay(intent.delayMs).toUpperCase()}.` : `YOUR SIZE ${fmtUsdWhole(intent.sizeUsd)} EXCEEDS SURVIVING CAPACITY AT ${fmtDelay(intent.delayMs).toUpperCase()}.${snap.state.sourceExits.length ? ' SOURCE EXIT OVERLAPS FOLLOWER EXITS.' : ''}`) : '';

  return (
    <main className="min-h-screen bg-desk p-2 text-[16px] sm:p-3 sm:text-[19px] lg:text-[22px]">
      <div className="bios-box mx-auto flex min-h-[calc(100vh-16px)] max-w-[1440px] flex-col bg-bios">
        <header className="px-3 pb-2 pt-3 text-center">
          <h1 className="bios-title text-[1.35em] leading-none">SECOND ORDER ALPHA CRASH TEST UTILITY v0.1</h1>
          <p className="mt-1 text-bios-fg">
            (C) 2026 SECOND ORDER · SHADOW-FOLLOWER SIMULATION · <span className={toneClass[provTone]}>{prov ? PROVENANCE_LABEL[prov].toUpperCase() : '—'}</span>
            {derived?.quality.degraded && !armed ? <span className="text-bios-yellow"> · DATA INCOMPLETE, NO ALLOW</span> : null}
          </p>
        </header>

        <div className="grid gap-2 px-2 md:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <Panel>
            <div role="tablist" aria-label="Setup pages" className="flex gap-1 px-3 pt-1">
              {(['main', 'target'] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => { setTab(t); setSelectedId(t === 'target' ? 'target' : 'size'); }}
                  className={`px-3 leading-none ${tab === t ? 'bios-selected' : 'text-bios-cyan hover:text-bios-white'}`}>
                  {t === 'main' ? 'MAIN' : 'TARGET WALLET'}
                </button>
              ))}
              <span className="ml-auto text-bios-dim">F2 switch page</span>
            </div>
            <SettingsList items={visibleItems} readouts={visibleReadouts} selectedId={selectedId} onSelect={setSelectedId} editingId={editingId} onEditingChange={setEditingId} />
            {tab === 'target' && (
              <div className="px-5 pb-2 text-bios-fg">
                <div className="bios-rule mb-2" />
                {snap.replays.length > 0 && <p className="text-bios-dim">Replays with provenance: {snap.replays.map((r) => r.title).join(' · ')}</p>}
                <p className="mt-1">{canReconstruct ? 'Press F6 to reconstruct the target wallet.' : target.wallet ? 'Address not valid yet.' : 'Type an address on TARGET WALLET and press ⏎.'}</p>
              </div>
            )}
          </Panel>
          <Panel className="hidden md:block">
            <HelpPanel title={help.title} lines={help.lines} footer={['↑↓ select · +/− change · ⏎ edit', 'Your size, delay and policy stay in this browser.']} />
          </Panel>
        </div>

        <div className="px-2 pt-2">
          <Panel title="CRASH TEST RECORDER" right={<span>{snap.manifest?.title ?? ''} · {snap.state.seen.size} EVENTS</span>}>
            <div className="overflow-x-auto px-3 pb-2 pt-1">
              <div className="min-w-[72ch] space-y-1">
                <AlphaMeter remainingUsd={remainingUsd} startUsd={startAlphaUsd} delayMs={intent.delayMs} />
                <FlowAndDepth derived={derived} state={snap.state} />
                <div className="bios-rule my-1" />
                <div className="grid gap-x-10 gap-y-2 xl:grid-cols-[auto_minmax(0,1fr)]">
                  <FollowerGrid shadows={shadows} nowAt={nowAt} intent={intent} cols={GRID_COLS} colLabels={COL_LABELS} />
                  <CapacityMap curve={curve} intent={intent} maxCompatibleUsd={verdict?.maxCompatibleUsd ?? null} />
                </div>
                <div className="bios-rule my-1" />
                <p className={`${snap.phase === 'failed' ? 'text-bios-red' : running ? 'text-bios-yellow' : 'text-bios-fg'} ${running && !reducedMotion ? 'bios-caret' : ''}`} role="status" aria-live="polite">{statusLine}</p>
              </div>
            </div>
          </Panel>
        </div>

        <footer className="mt-auto px-2 pb-2 pt-2">
          <div className="bios-box">
            <KeyLegend keys={[
              { key: '↑↓', label: 'Select' },
              { key: '+/−', label: 'Change', onClick: () => selectedItem?.onDelta?.(1), disabled: !selectedItem?.onDelta || selectedItem.disabled },
              { key: 'F2', label: tab === 'main' ? 'Target wallet' : 'Main page', onClick: () => { const next = tab === 'main' ? 'target' : 'main'; setTab(next); setSelectedId(next === 'target' ? 'target' : 'size'); } },
              { key: 'F5', label: armed ? 'Run crash test' : running ? 'Running…' : 'Run again', onClick: armed ? run : reset, disabled: busy || blocked },
              { key: 'F6', label: 'Reconstruct', onClick: reconstruct, disabled: !canReconstruct },
              { key: 'F8', label: blocked ? 'Unblock' : 'Block wallet', onClick: () => wallet && (blocked ? intentApi.unblock(wallet) : intentApi.block(wallet)), disabled: !wallet },
              { key: 'F9', label: 'Evidence', onClick: () => setEvidenceOpen(true) },
              { key: 'F10', label: 'Report', onClick: () => reportHref && window.location.assign(reportHref), disabled: !reportHref },
              { key: 'ESC ESC', label: 'Reset', onClick: reset, disabled: armed },
            ]} />
          </div>
        </footer>
      </div>

      <EvidenceWindow open={evidenceOpen} onOpenChange={setEvidenceOpen} state={snap.state} derived={derived} verdict={verdict} manifest={snap.manifest} intent={intent} nowAt={nowAt} />
      {verdict && snap.phase === 'ended' && (
        <VerdictDialog
          open={verdictOpen}
          onOpenChange={setVerdictOpen}
          verdict={verdict}
          intent={intent}
          remainingUsd={remainingUsd}
          onResize={(usd) => intentApi.setSize(usd)}
          onBlock={() => wallet && intentApi.block(wallet)}
          onEvidence={() => setEvidenceOpen(true)}
          reportHref={reportHref}
        />
      )}
    </main>
  );
}
