/**
 * Mobula live data source.
 *
 * Session flow for a tracked wallet:
 *  1. REST: wallet analysis → source.profile; latest buy from wallet trades → source.trade
 *     (the event-time origin); token security and market details snapshots.
 *  2. WSS quoting (Growth+): one subscription per sample size on the follower route
 *     (quote token → base token) → quote.observed. Falls back to REST swap quoting polling
 *     when the stream is plan-gated.
 *  3. WSS fast-trade in asset mode (Growth+): other wallets' same-token trades → flow.competing;
 *     the tracked wallet's sells → source.exit. Falls back to polling wallet trades for exits.
 *  4. stream.status on every transport transition; capability report tells the UI what is
 *     available, plan-gated or unreachable under the current key.
 *
 * Nothing user-specific enters here.
 */
import type { CapabilityState, DomainEvent, Provenance, TokenRef } from '@second-order/contracts';
import { FastTradeFrame, QuotingFrame } from '@second-order/contracts/mobula';
import type { Config } from '../../config.js';
import type { CapabilityReport, DataSource, SessionSpec } from '../types.js';
import { chainIdFromName, chainName, normalizeCompetingFlow, normalizeMarket, normalizeProfile, normalizeQuote, normalizeRestQuote, normalizeSecurity, normalizeSourceExit, normalizeSourceTrade, statusEvent, type NormalizeContext } from './normalize.js';
import { MobulaHttpError, MobulaRest } from './rest.js';
import { ReconnectingSocket } from './ws.js';

const QUOTE_SIZES_USD = [100, 1000, 5000];
const DEFAULT_SESSION_MS = 120_000;
const REST_QUOTE_POLL_MS = 3000;
const EXIT_POLL_MS = 8000;

type Queue = { push: (e: DomainEvent) => void; end: () => void; iter: AsyncIterable<DomainEvent> };
function queue(signal: AbortSignal): Queue {
  const buf: DomainEvent[] = [];
  let resolve: (() => void) | null = null;
  let ended = false;
  const wake = () => { resolve?.(); resolve = null; };
  signal.addEventListener('abort', () => { ended = true; wake(); }, { once: true });
  return {
    push: (e) => { if (!ended) { buf.push(e); wake(); } },
    end: () => { ended = true; wake(); },
    iter: {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          while (buf.length) yield buf.shift()!;
          if (ended) return;
          await new Promise<void>((r) => { resolve = r; });
        }
      },
    },
  };
}

export function createMobulaDataSource(config: Config, rest: MobulaRest = new MobulaRest({ baseUrl: config.MOBULA_REST_URL, apiKey: config.MOBULA_API_KEY ?? '', rps: config.MOBULA_RPS })): DataSource {
  const apiKey = config.MOBULA_API_KEY ?? '';
  let cachedCaps: CapabilityReport | null = null;

  async function probe<T>(fn: () => Promise<T>): Promise<CapabilityState> {
    try { await fn(); return 'available'; } catch (err) {
      if (err instanceof MobulaHttpError) return err.planGated ? 'plan-gated' : 'unreachable';
      return 'unreachable';
    }
  }

  /** One WSS probe: subscribe, wait for an ack/quote or an error frame. */
  function probeSocket(url: string, subscribe: unknown, ok: (frame: unknown) => boolean): Promise<CapabilityState> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (s: CapabilityState) => { if (!done) { done = true; sock.close(); resolve(s); } };
      const sock = new ReconnectingSocket({
        url,
        onOpen: (send) => send(subscribe),
        onFrame: (f) => {
          const frame = f as { error?: unknown; message?: string; type?: string };
          if (frame?.error || /unauthori|plan|forbidden|upgrade/i.test(String(frame?.message ?? ''))) return finish('plan-gated');
          if (ok(f)) finish('available');
        },
        onState: (s) => { if (s.state === 'reconnecting' && s.attempt >= 1) finish('unreachable'); },
        staleAfterMs: 8000,
      });
      sock.start();
      setTimeout(() => finish('unreachable'), 10_000);
    });
  }

  async function capabilities(): Promise<CapabilityReport> {
    if (cachedCaps && Date.now() - Date.parse(cachedCaps.checkedAt) < 5 * 60_000) return cachedCaps;
    if (!apiKey) {
      return { provider: 'mobula', capabilities: Object.fromEntries(['wallet-trades-v2', 'wallet-analysis', 'token-security', 'market-details', 'swap-quoting-rest', 'quoting-wss', 'fast-trade-wss'].map((k) => [k, 'disabled' as const])), checkedAt: new Date().toISOString() };
    }
    // Cheap REST probes on a well-known Base pool (WETH/USDC) and a known wallet; 1 credit each except security (10).
    const probeWallet = '0xaF88370abD82EC6943cdB3D4ec7b764B92c35B43';
    const [trades, analysis, market, quote, quotingWss, fastWss] = await Promise.all([
      probe(() => rest.walletTrades({ wallet: probeWallet, limit: 1 })),
      probe(() => rest.walletAnalysis({ wallet: probeWallet, period: '7d' })),
      probe(() => rest.marketDetails({ blockchain: 'base', address: '0xd0b53D9277642d899DF5C87A3966A349A798F224' })),
      probe(() => rest.swapQuote({ chainId: 'evm:8453', tokenIn: '0x4200000000000000000000000000000000000006', tokenOut: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', amount: '0.01', walletAddress: probeWallet })),
      probeSocket(config.MOBULA_WSS_URL, { type: 'quoting', authorization: apiKey, payload: { chainId: 'evm:8453', tokenIn: '0x4200000000000000000000000000000000000006', tokenOut: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', amountUSD: 100, walletAddress: probeWallet, subscriptionTracking: true, intervalMs: 5000 } }, (f) => (f as { type?: string }).type === 'quoting' || (f as { event?: string }).event === 'subscribed'),
      probeSocket(config.MOBULA_WSS_URL, { type: 'fast-trade', authorization: apiKey, payload: { assetMode: true, items: [{ blockchain: 'evm:8453', address: '0x4200000000000000000000000000000000000006' }], subscriptionTracking: true, maxUpdatesPerMinute: 2 } }, (f) => typeof (f as { hash?: string }).hash === 'string' || (f as { event?: string }).event === 'subscribed'),
    ]);
    cachedCaps = {
      provider: 'mobula',
      capabilities: { 'wallet-trades-v2': trades, 'wallet-analysis': analysis, 'token-security': 'unknown', 'market-details': market, 'swap-quoting-rest': quote, 'quoting-wss': quotingWss, 'fast-trade-wss': fastWss },
      checkedAt: new Date().toISOString(),
    };
    return cachedCaps;
  }

  async function* start(spec: SessionSpec, signal: AbortSignal): AsyncIterable<DomainEvent> {
    if (!apiKey) throw Object.assign(new Error('MOBULA_API_KEY is not configured'), { code: 'PROVIDER_UNAVAILABLE', status: 503 });
    if (!spec.wallet) throw Object.assign(new Error('wallet is required for live sessions'), { code: 'BAD_REQUEST', status: 400 });
    const provenance: Provenance = { kind: 'live-witnessed', source: 'mobula-rest' };
    let seq = 0;
    const ctxBase = { sessionId: spec.sessionId, nextSeq: () => seq++ };
    const q = queue(signal);
    const sockets: ReconnectingSocket[] = [];
    const timers: ReturnType<typeof setInterval>[] = [];
    const cleanup = () => { sockets.forEach((s) => s.close()); timers.forEach((t) => clearInterval(t)); };
    signal.addEventListener('abort', () => { cleanup(); q.end(); }, { once: true });

    try {
      // 1. Anchor on the latest buy by the wallet.
      const trades = await rest.walletTrades({ wallet: spec.wallet, blockchains: spec.chainId ? chainName(spec.chainId) : undefined, limit: 20 }, signal);
      const buy = trades.data.find((t) => t.type === 'buy' && (t.baseTokenAmountUSD ?? 0) > 0);
      if (!buy) throw Object.assign(new Error('No recent buy found for this wallet'), { code: 'NO_SOURCE_TRADE', status: 404 });
      const ctx: NormalizeContext = { ...ctxBase, provenance, originMs: buy.date };
      const sourceEvent = normalizeSourceTrade(ctx, buy);
      const source = sourceEvent.payload as Extract<DomainEvent, { type: 'source.trade' }>['payload'];
      const chainId = source.chainId;
      const token: TokenRef = source.token;

      const caps = await capabilities();
      q.push(statusEvent(ctx, { provider: 'mobula', state: 'connected', capabilities: caps.capabilities, message: 'Live session anchored on the latest buy' }));
      q.push(sourceEvent);

      // Context snapshots (best effort; missing ones degrade the verdict, never crash the session).
      const now = Date.now();
      await Promise.all([
        rest.walletAnalysis({ wallet: spec.wallet, period: '90d' }, signal).then((a) => q.push(normalizeProfile(ctx, spec.wallet!, a, 90))).catch((e) => q.push(statusEvent(ctx, { provider: 'mobula', state: 'degraded', message: `wallet analysis unavailable: ${(e as Error).message}` }))),
        rest.tokenSecurity({ blockchain: chainId, address: token.address }, signal).then((s) => q.push(normalizeSecurity(ctx, s, now))).catch((e) => q.push(statusEvent(ctx, { provider: 'mobula', state: 'degraded', message: `token security unavailable: ${(e as Error).message}` }))),
        source.poolAddress
          ? rest.marketDetails({ blockchain: chainId, address: source.poolAddress }, signal).then((m) => q.push(normalizeMarket(ctx, m, chainId, now))).catch((e) => q.push(statusEvent(ctx, { provider: 'mobula', state: 'degraded', message: `market details unavailable: ${(e as Error).message}` })))
          : Promise.resolve(q.push(statusEvent(ctx, { provider: 'mobula', state: 'degraded', message: 'no pool address on the source trade; liquidity unknown' }))),
      ]);

      // 2. Quotes on the follower route.
      const quoteTokenAddress = source.quoteToken.address;
      if (caps.capabilities['quoting-wss'] === 'available') {
        for (const sizeUsd of QUOTE_SIZES_USD) {
          const subscriptionId = `so-quote-${sizeUsd}-${spec.sessionId.slice(0, 8)}`;
          const sock = new ReconnectingSocket({
            url: config.MOBULA_WSS_URL,
            onOpen: (send) => send({ type: 'quoting', authorization: apiKey, payload: { chainId, tokenIn: quoteTokenAddress, tokenOut: token.address, amountUSD: sizeUsd, walletAddress: spec.wallet, slippage: 1, intervalMs: 1000, minIntervalMs: 300, subscriptionId, subscriptionTracking: true } }),
            onFrame: (f) => {
              const parsed = QuotingFrame.safeParse(f);
              if (!parsed.success) return;
              const ev = normalizeQuote({ ...ctx, provenance: { ...provenance, source: 'mobula-wss' } }, parsed.data, sizeUsd, source.executionPriceUsd);
              if (ev) q.push(ev);
            },
            onState: (s) => q.push(statusEvent(ctx, { provider: 'mobula', state: s.state === 'open' ? 'connected' : s.state === 'stale' ? 'stale' : s.state === 'closed' ? 'ended' : 'reconnecting', attempt: s.attempt, nextRetryMs: s.nextRetryMs, lastMessageAgeMs: s.lastMessageAgeMs, message: s.message ? `quoting ${sizeUsd}: ${s.message}` : undefined })),
            staleAfterMs: 10_000,
          });
          sock.start();
          sockets.push(sock);
        }
      } else {
        q.push(statusEvent(ctx, { provider: 'mobula', state: 'degraded', message: `quoting stream ${caps.capabilities['quoting-wss']}; polling REST swap quotes every ${REST_QUOTE_POLL_MS / 1000}s` }));
        const poll = async () => {
          for (const sizeUsd of QUOTE_SIZES_USD) {
            try {
              // REST quoting sizes the order in tokenIn units; convert USD through the quote token's USD price at the source trade.
              const amountTokens = (sizeUsd / Math.max(1e-9, source.quoteTokenPriceUsd ?? 1)).toString();
              const r = await rest.swapQuote({ chainId, tokenIn: quoteTokenAddress, tokenOut: token.address, amount: amountTokens, walletAddress: spec.wallet! }, signal);
              const out = Number(r.data?.estimatedAmountOut ?? 0) / 10 ** token.decimals;
              if (out > 0) q.push(normalizeRestQuote(ctx, { chainId, tokenIn: quoteTokenAddress, tokenOut: token.address, sizeUsd, amountOutTokens: out, estimatedSlippage: r.data?.estimatedSlippage ?? null, sourcePriceUsd: source.executionPriceUsd, requestId: r.data?.requestId, quotedAt: Date.now() }));
            } catch (e) { q.push(statusEvent(ctx, { provider: 'mobula', state: 'degraded', message: `swap quote failed: ${(e as Error).message}` })); }
          }
        };
        void poll();
        timers.push(setInterval(() => void poll(), REST_QUOTE_POLL_MS));
      }

      // 3. Competing flow and source exits.
      const seenTx = new Set<string>([buy.transactionHash]);
      if (caps.capabilities['fast-trade-wss'] === 'available') {
        const sock = new ReconnectingSocket({
          url: config.MOBULA_WSS_URL,
          onOpen: (send) => send({ type: 'fast-trade', authorization: apiKey, payload: { assetMode: true, items: [{ blockchain: chainId, address: token.address }], subscriptionTracking: true, filterOutliers: true } }),
          onFrame: (f) => {
            const parsed = FastTradeFrame.safeParse(f);
            if (!parsed.success) return;
            const t = parsed.data;
            if (seenTx.has(t.hash)) return;
            seenTx.add(t.hash);
            const wctx = { ...ctx, provenance: { ...provenance, source: 'mobula-wss' as const } };
            if (t.sender && t.sender.toLowerCase() === spec.wallet!.toLowerCase()) {
              if (t.type === 'sell') q.push(normalizeSourceExit(wctx, { id: t.hash, type: 'sell', date: t.date, blockchain: chainId, transactionHash: t.hash, baseTokenAmount: t.tokenAmount ?? 0, baseTokenAmountUSD: t.tokenAmountUsd ?? null, baseTokenPriceUSD: t.tokenPrice ?? null }, { executionPriceUsd: source.executionPriceUsd, tokenAmount: source.tokenAmount, wallet: source.wallet, chainId, token }));
              return;
            }
            const ev = normalizeCompetingFlow(wctx, t, token, chainId);
            if (ev) q.push(ev);
          },
          onState: (s) => q.push(statusEvent(ctx, { provider: 'mobula', state: s.state === 'open' ? 'connected' : s.state === 'stale' ? 'stale' : s.state === 'closed' ? 'ended' : 'reconnecting', attempt: s.attempt, nextRetryMs: s.nextRetryMs, lastMessageAgeMs: s.lastMessageAgeMs, message: s.message ? `fast-trade: ${s.message}` : undefined })),
          staleAfterMs: 30_000,
        });
        sock.start();
        sockets.push(sock);
      } else {
        q.push(statusEvent(ctx, { provider: 'mobula', state: 'degraded', message: `fast-trade stream ${caps.capabilities['fast-trade-wss']}; competing flow unavailable, source exits polled every ${EXIT_POLL_MS / 1000}s` }));
        timers.push(setInterval(async () => {
          try {
            const later = await rest.walletTrades({ wallet: spec.wallet!, tokenAddress: token.address, from: buy.date + 1, order: 'asc', limit: 20 }, signal);
            for (const t of later.data) {
              if (t.type !== 'sell' || seenTx.has(t.transactionHash)) continue;
              seenTx.add(t.transactionHash);
              q.push(normalizeSourceExit(ctx, t, { executionPriceUsd: source.executionPriceUsd, tokenAmount: source.tokenAmount, wallet: source.wallet, chainId, token }));
            }
          } catch (e) { q.push(statusEvent(ctx, { provider: 'mobula', state: 'degraded', message: `exit poll failed: ${(e as Error).message}` })); }
        }, EXIT_POLL_MS));
      }

      // 4. Bounded session.
      const endAt = setTimeout(() => { q.push(statusEvent(ctx, { provider: 'mobula', state: 'ended', message: 'Live session window complete' })); cleanup(); q.end(); }, DEFAULT_SESSION_MS);
      signal.addEventListener('abort', () => clearTimeout(endAt), { once: true });

      for await (const e of q.iter) yield e;
    } finally {
      cleanup();
    }
  }

  return { kind: 'mobula', provenanceKind: () => 'live-witnessed', capabilities, start };
}

export { chainIdFromName };
