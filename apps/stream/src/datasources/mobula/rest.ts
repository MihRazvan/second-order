/**
 * Mobula REST client. Field names follow docs.mobula.io as reviewed on 2026-09-04.
 * Every response is validated with the loose zod shapes in @second-order/contracts/mobula.
 * Rate limiting is a token bucket at the configured RPS; 429s honour Retry-After.
 */
import {
  MarketDetailsResponse,
  SwapQuotingResponse,
  TokenSecurityResponse,
  WalletAnalysisResponse,
  WalletTradesV2Response,
} from '@second-order/contracts/mobula';
import type { z } from 'zod';

export class MobulaHttpError extends Error {
  constructor(public status: number, message: string, public retryAfterMs?: number) {
    super(message);
  }
  /** 401/402/403 mean the key or plan does not cover the endpoint. */
  get planGated() { return this.status === 401 || this.status === 402 || this.status === 403; }
}

class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(private rps: number, private burst = Math.max(1, Math.ceil(rps))) { this.tokens = this.burst; }
  async take(signal?: AbortSignal): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rps);
      this.last = now;
      if (this.tokens >= 1) { this.tokens -= 1; return; }
      const wait = ((1 - this.tokens) / this.rps) * 1000;
      await new Promise<void>((r) => { const t = setTimeout(r, wait); signal?.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });
      if (signal?.aborted) throw new Error('aborted');
    }
  }
}

export interface MobulaRestOptions {
  baseUrl: string;
  apiKey: string;
  rps: number;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
}

export class MobulaRest {
  private bucket: TokenBucket;
  private fetchImpl: typeof fetch;
  private maxRetries: number;
  constructor(private opts: MobulaRestOptions) {
    this.bucket = new TokenBucket(opts.rps);
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  private async get<T extends z.ZodTypeAny>(path: string, params: Record<string, string | number | undefined>, schema: T, signal?: AbortSignal): Promise<z.infer<T>> {
    const url = new URL(path, this.opts.baseUrl);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    let attempt = 0;
    for (;;) {
      await this.bucket.take(signal);
      const res = await this.fetchImpl(url, { headers: { Authorization: this.opts.apiKey, Accept: 'application/json' }, signal });
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after'));
        const retryAfterMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 250;
        if (attempt++ >= this.maxRetries) throw new MobulaHttpError(res.status, `Mobula ${res.status} on ${url.pathname}`, retryAfterMs);
        await new Promise((r) => setTimeout(r, retryAfterMs));
        continue;
      }
      if (!res.ok) {
        let detail = '';
        try { detail = ((await res.json()) as { message?: string; error?: string }).message ?? ''; } catch { /* no body */ }
        throw new MobulaHttpError(res.status, `Mobula ${res.status} on ${url.pathname}${detail ? `: ${detail}` : ''}`);
      }
      const json = await res.json();
      const parsed = schema.safeParse(json);
      if (!parsed.success) throw new Error(`Mobula response failed validation on ${url.pathname}: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
      return parsed.data;
    }
  }

  /** GET /api/2/wallet/trades */
  walletTrades(p: { wallet: string; blockchains?: string; tokenAddress?: string; limit?: number; order?: 'asc' | 'desc'; from?: number }, signal?: AbortSignal) {
    return this.get('/api/2/wallet/trades', { wallet: p.wallet, blockchains: p.blockchains, tokenAddress: p.tokenAddress, limit: p.limit ?? 20, order: p.order ?? 'desc', from: p.from }, WalletTradesV2Response, signal);
  }
  /** GET /api/2/wallet/analysis */
  walletAnalysis(p: { wallet: string; blockchains?: string; period?: '1d' | '7d' | '30d' | '90d' }, signal?: AbortSignal) {
    return this.get('/api/2/wallet/analysis', { wallet: p.wallet, blockchains: p.blockchains, period: p.period ?? '90d' }, WalletAnalysisResponse, signal);
  }
  /** GET /api/2/token/security */
  tokenSecurity(p: { blockchain: string; address: string }, signal?: AbortSignal) {
    return this.get('/api/2/token/security', { blockchain: p.blockchain, address: p.address }, TokenSecurityResponse, signal);
  }
  /** GET /api/2/market/details */
  marketDetails(p: { blockchain: string; address: string }, signal?: AbortSignal) {
    return this.get('/api/2/market/details', { blockchain: p.blockchain, address: p.address }, MarketDetailsResponse, signal);
  }
  /** GET /api/2/swap/quoting */
  swapQuote(p: { chainId: string; tokenIn: string; tokenOut: string; amount: string; walletAddress: string; slippage?: string }, signal?: AbortSignal) {
    return this.get('/api/2/swap/quoting', { chainId: p.chainId, tokenIn: p.tokenIn, tokenOut: p.tokenOut, amount: p.amount, walletAddress: p.walletAddress, slippage: p.slippage ?? '1' }, SwapQuotingResponse, signal);
  }
}
