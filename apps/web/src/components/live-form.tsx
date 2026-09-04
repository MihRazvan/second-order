'use client';
import { useId, useState } from 'react';

interface Props {
  available: boolean;
  disabled: boolean;
  onStart: (wallet: string, chainId?: string) => void;
}

const WALLET_RE = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;

/** Live mode entry. Rendered only when the stream service reports a ready Mobula provider. */
export function LiveForm({ available, disabled, onStart }: Props) {
  const id = useId();
  const [wallet, setWallet] = useState('');
  const [chainId, setChainId] = useState('');
  if (!available) return null;
  const valid = WALLET_RE.test(wallet.trim());
  return (
    <form
      className="flex flex-wrap items-end gap-3 border-t border-line px-6 py-4 md:px-8"
      onSubmit={(e) => { e.preventDefault(); if (valid) onStart(wallet.trim(), chainId || undefined); }}
    >
      <label htmlFor={id} className="block min-w-[320px] flex-1">
        <span className="text-[12px] text-fg-muted">Track a wallet live (Mobula)</span>
        <input id={id} value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x… or Solana address" spellCheck={false}
          className="font-data mt-1 w-full border-b border-line-strong bg-transparent py-1.5 text-[14px] text-fg outline-none focus:border-amber" />
      </label>
      <label className="block">
        <span className="text-[12px] text-fg-muted">Chain</span>
        <select value={chainId} onChange={(e) => setChainId(e.target.value)} className="font-data mt-1 block border-b border-line-strong bg-transparent py-1.5 text-[14px] text-fg outline-none focus:border-amber">
          <option value="">any</option>
          <option value="evm:8453">Base</option>
          <option value="evm:1">Ethereum</option>
          <option value="evm:42161">Arbitrum</option>
          <option value="evm:56">BNB Chain</option>
          <option value="solana:solana">Solana</option>
        </select>
      </label>
      <button type="submit" disabled={!valid || disabled} className="border border-line-strong px-3.5 py-2 text-[13px] hover:border-fg disabled:opacity-50">
        Crash test live
      </button>
      <span className="basis-full text-[11px] text-fg-faint">Anchors on the wallet's latest buy and witnesses quotes and competing flow for two minutes. Labelled live witnessed only for what is actually captured.</span>
    </form>
  );
}
