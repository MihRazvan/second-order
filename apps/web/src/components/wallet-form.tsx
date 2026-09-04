'use client';
import { useId, useState } from 'react';
import type { ReplayManifest } from '@second-order/contracts';
import { PROVENANCE_LABEL } from '@second-order/contracts';

interface Props {
  reconstructionAvailable: boolean;
  liveAvailable: boolean;
  replays: ReplayManifest[];
  currentReplayId: string | null;
  disabled: boolean;
  onReconstruct: (wallet: string, chainId: string | undefined, windowSeconds: number, tradeIndex: number) => void;
  onLive: (wallet: string, chainId?: string) => void;
  onSelectReplay: (id: string) => void;
}

const WALLET_RE = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;
const CHAINS = [['', 'any chain'], ['evm:8453', 'Base'], ['evm:1', 'Ethereum'], ['evm:42161', 'Arbitrum'], ['evm:56', 'BNB Chain'], ['solana:solana', 'Solana']] as const;

/**
 * Where a judge points the tool at something they care about. Reconstruction works from
 * Mobula REST history (keyless demo API included); live needs a Growth-plan key. Replays
 * are the shipped fixtures and any captured sessions.
 */
export function WalletForm(p: Props) {
  const id = useId();
  const [wallet, setWallet] = useState('');
  const [chainId, setChainId] = useState('');
  const [windowSeconds, setWindowSeconds] = useState(300);
  const [tradeIndex, setTradeIndex] = useState(0);
  const valid = WALLET_RE.test(wallet.trim());
  const canRecon = p.reconstructionAvailable && valid && !p.disabled;

  return (
    <section className="grid gap-6 border-t border-line px-6 py-5 md:grid-cols-[1fr_360px] md:px-8">
      <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); if (canRecon) p.onReconstruct(wallet.trim(), chainId || undefined, windowSeconds, tradeIndex); }}>
        <label htmlFor={id} className="block sm:col-span-4">
          <span className="text-[13px] font-medium">Crash test any wallet</span>
          <span className="block text-[12px] text-fg-muted">Reconstructs the minutes after its latest buy from Mobula history. Estimated, not witnessed.</span>
        </label>
        <div className="flex items-baseline border-b border-line-strong focus-within:border-amber">
          <input id={id} value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x… or Solana address" spellCheck={false} autoComplete="off"
            className="font-data w-full bg-transparent py-1.5 text-[14px] text-fg outline-none placeholder:text-fg-faint" aria-label="Wallet address" />
        </div>
        <label className="block text-[12px] text-fg-muted">
          Chain
          <select value={chainId} onChange={(e) => setChainId(e.target.value)} className="font-data block border-b border-line-strong bg-transparent py-1.5 text-[13px] text-fg outline-none focus:border-amber">
            {CHAINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="block text-[12px] text-fg-muted">
          Window
          <select value={windowSeconds} onChange={(e) => setWindowSeconds(Number(e.target.value))} className="font-data block border-b border-line-strong bg-transparent py-1.5 text-[13px] text-fg outline-none focus:border-amber">
            <option value={120}>2 min</option><option value={300}>5 min</option><option value={900}>15 min</option><option value={1800}>30 min</option>
          </select>
        </label>
        <label className="block text-[12px] text-fg-muted">
          Which buy
          <select value={tradeIndex} onChange={(e) => setTradeIndex(Number(e.target.value))} className="font-data block border-b border-line-strong bg-transparent py-1.5 text-[13px] text-fg outline-none focus:border-amber">
            {[0, 1, 2, 3, 4].map((i) => <option key={i} value={i}>{i === 0 ? 'latest' : `${i} before`}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-4">
          <button type="submit" disabled={!canRecon} className="bg-fg px-3.5 py-2 text-[13px] font-medium text-bg-sunken hover:bg-white disabled:opacity-40">Reconstruct crash test</button>
          {p.liveAvailable && (
            <button type="button" disabled={!valid || p.disabled} onClick={() => p.onLive(wallet.trim(), chainId || undefined)} className="border border-line-strong px-3.5 py-2 text-[13px] hover:border-fg disabled:opacity-40">Witness live (2 min)</button>
          )}
          {!p.reconstructionAvailable && <span className="self-center text-[12px] text-amber">Stream service unreachable: only the local replay is available.</span>}
        </div>
      </form>

      <div>
        <div className="text-[13px] font-medium">Replays</div>
        <div className="text-[12px] text-fg-muted">Shipped fixtures and captured sessions, each with its provenance.</div>
        <ul className="mt-2 grid gap-1">
          {p.replays.map((r) => {
            const active = r.id === p.currentReplayId;
            return (
              <li key={r.id}>
                <button type="button" disabled={p.disabled} onClick={() => p.onSelectReplay(r.id)} aria-pressed={active}
                  className={`grid w-full grid-cols-[8px_1fr_auto] items-center gap-3 border px-3 py-2 text-left text-[13px] hover:border-fg disabled:opacity-50 ${active ? 'border-fg bg-bg-raised' : 'border-line'}`}>
                  <span aria-hidden className={`h-[7px] w-[7px] ${r.provenance.kind === 'live-witnessed' ? 'bg-alpha' : r.provenance.kind === 'estimated-reconstruction' ? 'bg-evidence' : 'bg-amber'}`} />
                  <span className="truncate">{r.title}</span>
                  <span className="font-data text-[11px] text-fg-muted">{PROVENANCE_LABEL[r.provenance.kind]}</span>
                </button>
              </li>
            );
          })}
          {p.replays.length === 0 && <li className="text-[12px] text-fg-faint">Only the bundled demo scenario (stream service offline).</li>}
        </ul>
      </div>
    </section>
  );
}
