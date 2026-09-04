import { describe, expect, it } from 'vitest';
import { DomainEvent } from '@second-order/contracts';
import { FastTradeFrame, QuotingFrame, TokenSecurityResponse, WalletTradeV2 } from '@second-order/contracts/mobula';
import { chainIdFromName, normalizeCompetingFlow, normalizeQuote, normalizeSecurity, normalizeSourceExit, normalizeSourceTrade, type NormalizeContext } from '../src/datasources/mobula/normalize';

/** Raw shapes copied from the Mobula documentation examples (2026-09-04). */
const walletTrade = WalletTradeV2.parse({
  id: 't1', type: 'buy', operation: 'regular', baseTokenAmount: 12000, baseTokenAmountRaw: '12000000000000000000000', baseTokenAmountUSD: 5900,
  quoteTokenAmount: 1.9, quoteTokenAmountRaw: '1900000000000000000', quoteTokenAmountUSD: 5900, baseTokenPriceUSD: 0.4917, quoteTokenPriceUSD: 3105,
  date: 1757000000000, blockchain: 'Base', transactionHash: '0xabc', marketAddress: '0xpool', transactionSenderAddress: '0xwallet', swapSenderAddress: '0xwallet', swapRecipient: null,
  baseToken: { address: '0xtoken', name: 'Token', symbol: 'TKN', logo: null, decimals: 18 }, quoteToken: { address: '0xweth', name: 'Wrapped Ether', symbol: 'WETH', logo: null, decimals: 18 },
  labels: ['smart-money'], platform: { id: 1, name: 'Uniswap V3', logo: null }, totalFeesUSD: 17.8, gasFeesUSD: 0.05, platformFeesUSD: 17.7, mevFeesUSD: null,
});

const quotingFrame = QuotingFrame.parse({
  type: 'quoting', subscriptionId: 'sub_abc123', event: 'quote', quoteTrigger: 'swap', quoteSequence: 12, requestId: '6d9e5d8e', chainId: 'evm:8453',
  tokenInAddress: '0xweth', tokenOutAddress: '0xtoken', amountOutTokens: '1950.5', slippagePercentage: 3.5, marketImpactPercentage: 0.18,
  amountInUSD: 1000, amountOutUSD: 994, latencyMs: 42, timestamp: 1757000005000,
});

const fastTrade = FastTradeFrame.parse({
  token: '0xtoken', date: 1757000003000, tokenPrice: 0.5, tokenAmount: 800, tokenAmountUsd: 400, type: 'buy', operation: 'regular', blockchain: 'Base', hash: '0xflow1', sender: '0xother', labels: ['proTrader'],
});

const ctx: NormalizeContext = { sessionId: 's', provenance: { kind: 'live-witnessed', source: 'mobula-rest' }, originMs: 1757000000000, nextSeq: (() => { let i = 0; return () => i++; })() };

describe('Mobula normalization', () => {
  it('maps chain names to chain ids', () => {
    expect(chainIdFromName('Base')).toBe('evm:8453');
    expect(chainIdFromName('Solana')).toBe('solana:solana');
    expect(chainIdFromName('evm:1')).toBe('evm:1');
  });

  it('wallet trade → source.trade with fees split and a deterministic id', () => {
    const e = DomainEvent.parse(normalizeSourceTrade(ctx, walletTrade));
    expect(e.type).toBe('source.trade');
    expect(e.id).toBe('mobula:trade:0xabc');
    expect(e.at).toBe(0);
    if (e.type === 'source.trade') {
      expect(e.payload.chainId).toBe('evm:8453');
      expect(e.payload.sizeUsd).toBe(5900);
      expect(e.payload.executionPriceUsd).toBeCloseTo(0.4917);
      expect(e.payload.feesUsd).toBe(0.05);
      expect(e.payload.platformFeesUsd).toBe(17.7);
    }
    expect(e.provenance.kind).toBe('live-witnessed');
  });

  it('later sell by the same wallet → source.exit with fraction and ratio', () => {
    const sell = WalletTradeV2.parse({ ...walletTrade, id: 't2', type: 'sell', baseTokenAmount: 6000, baseTokenAmountUSD: 3900, baseTokenPriceUSD: 0.65, date: 1757000030000, transactionHash: '0xexit' });
    const entry = { executionPriceUsd: 0.4917, tokenAmount: 12000, wallet: '0xwallet', chainId: 'evm:8453', token: { address: '0xtoken', symbol: 'TKN', decimals: 18 } };
    const e = DomainEvent.parse(normalizeSourceExit(ctx, sell, entry));
    if (e.type === 'source.exit') {
      expect(e.payload.fractionOfPosition).toBeCloseTo(0.5);
      expect(e.payload.priceRatioVsEntry).toBeCloseTo(0.65 / 0.4917);
      expect(e.payload.delayMs).toBe(30000);
    } else throw new Error('wrong type');
  });

  it('quoting frame → quote.observed with delay relative to the source trade', () => {
    const e = normalizeQuote(ctx, quotingFrame, 1000, 0.4917);
    expect(e).not.toBeNull();
    const parsed = DomainEvent.parse(e);
    if (parsed.type === 'quote.observed') {
      expect(parsed.payload.delayMs).toBe(5000);
      expect(parsed.payload.sizeUsd).toBe(1000);
      // $1000 bought 1950.5 tokens; at the source price those were worth 1950.5·0.4917 ≈ $959 → ratio ≈ 1.043
      expect(parsed.payload.effectivePriceRatio).toBeCloseTo(1000 / (1950.5 * 0.4917), 4);
      expect(parsed.payload.priceImpactPct).toBe(0.18);
      expect(parsed.payload.source).toBe('quoting-wss');
    } else throw new Error('wrong type');
  });

  it('quoting error frames are dropped, not normalized', () => {
    expect(normalizeQuote(ctx, { ...quotingFrame, error: { message: 'no route' } }, 1000, 0.49)).toBeNull();
  });

  it('fast-trade frame → flow.competing keyed by tx hash', () => {
    const e = DomainEvent.parse(normalizeCompetingFlow(ctx, fastTrade, { address: '0xtoken', symbol: 'TKN', decimals: 18 }, 'evm:8453'));
    expect(e.id).toBe('mobula:flow:0xflow1');
    if (e.type === 'flow.competing') {
      expect(e.payload.sizeUsd).toBe(400);
      expect(e.payload.delayMs).toBe(3000);
      expect(e.payload.wallet).toBe('0xother');
    }
  });

  it('token security → snapshot with completeness and parsed lock share', () => {
    const raw = TokenSecurityResponse.parse({ data: { address: '0xtoken', chainId: 'evm:8453', buyFeePercentage: 0, sellFeePercentage: 0, transferFeePercentage: 0, isMintable: false, isFreezable: null, transferPausable: false, isBlacklisted: false, isHoneypot: false, renounced: true, locked: '0.8500', balanceMutable: false, modifyableTax: false, selfDestruct: false, top10HoldingsPercentage: 45.2, staticAnalysisStatus: 'completed', liquidityBurnPercentage: 85.5 } });
    const e = DomainEvent.parse(normalizeSecurity(ctx, raw, 1757000000500));
    if (e.type === 'security.snapshot') {
      expect(e.payload.lpLockedShare).toBeCloseTo(0.85);
      expect(e.payload.completeness).toBeGreaterThan(0.9);
      expect(e.payload.isFreezable).toBeNull();
    } else throw new Error('wrong type');
  });
});
