import { drizzle } from 'drizzle-orm/postgres-js';
import { desc, eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import type { DomainEvent, ReplayManifest } from '@second-order/contracts';
import * as schema from './schema.js';
import type { CapacityRow, Persistence, ProcessingError } from './types.js';

export class PostgresPersistence implements Persistence {
  readonly kind = 'postgres' as const;
  private sql: ReturnType<typeof postgres>;
  private db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(url: string) {
    this.sql = postgres(url, { max: 5, idle_timeout: 20, connect_timeout: 5 });
    this.db = drizzle(this.sql, { schema });
  }

  private base(e: DomainEvent) {
    return {
      id: e.id + '@' + e.sessionId,
      sessionId: e.sessionId,
      seq: e.seq,
      at: e.at,
      provenanceKind: e.provenance.kind,
      provenanceSource: e.provenance.source,
      endpoint: e.provenance.endpoint ?? null,
      payload: e.payload,
    };
  }

  async saveEvent(e: DomainEvent): Promise<boolean> {
    const b = this.base(e);
    let res: { length: number } | undefined;
    switch (e.type) {
      case 'source.trade':
      case 'source.exit':
      case 'source.profile': {
        const p = e.payload as { wallet: string; chainId?: string; txHash?: string; sizeUsd?: number };
        res = await this.db.insert(schema.sourceTradeEvents).values({ ...b, kind: e.type.split('.')[1]!, wallet: p.wallet, chainId: p.chainId ?? null, txHash: p.txHash ?? null, sizeUsd: p.sizeUsd ?? null }).onConflictDoNothing().returning({ id: schema.sourceTradeEvents.id });
        break;
      }
      case 'quote.observed':
        res = await this.db.insert(schema.quoteObservations).values({ ...b, chainId: e.payload.chainId, delayMs: e.payload.delayMs, sizeUsd: e.payload.sizeUsd, effectivePriceRatio: e.payload.effectivePriceRatio, quoteRef: e.payload.quoteRef ?? null, source: e.payload.source }).onConflictDoNothing().returning({ id: schema.quoteObservations.id });
        break;
      case 'flow.competing':
        res = await this.db.insert(schema.competingFlowObservations).values({ ...b, chainId: e.payload.chainId, wallet: e.payload.wallet, txHash: e.payload.txHash, side: e.payload.side, sizeUsd: e.payload.sizeUsd, delayMs: e.payload.delayMs }).onConflictDoNothing().returning({ id: schema.competingFlowObservations.id });
        break;
      case 'security.snapshot':
        res = await this.db.insert(schema.securitySnapshots).values({ ...b, chainId: e.payload.chainId, address: e.payload.address, completeness: e.payload.completeness }).onConflictDoNothing().returning({ id: schema.securitySnapshots.id });
        break;
      case 'market.snapshot':
        res = await this.db.insert(schema.marketSnapshots).values({ ...b, chainId: e.payload.chainId, poolAddress: e.payload.poolAddress, liquidityUsd: e.payload.liquidityUsd, priceUsd: e.payload.priceUsd }).onConflictDoNothing().returning({ id: schema.marketSnapshots.id });
        break;
      default:
        return true; // status + markers are not persisted
    }
    return (res?.length ?? 0) > 0;
  }

  async saveCapacity(row: CapacityRow) {
    await this.db.insert(schema.capacitySnapshots).values({ ...row, degraded: row.degraded ? 1 : 0 }).onConflictDoNothing();
  }
  async saveManifest(m: ReplayManifest) {
    await this.db.insert(schema.replayManifests).values({ id: m.id, title: m.title, provenanceKind: m.provenance.kind, durationMs: m.durationMs, eventCount: m.eventCount, disclosure: m.disclosure, manifest: m, createdAt: new Date(m.createdAt) }).onConflictDoNothing();
  }
  async saveError(err: ProcessingError) {
    await this.db.insert(schema.processingErrors).values({ id: err.id, sessionId: err.sessionId ?? null, stage: err.stage, code: err.code, message: err.message.slice(0, 2000), rawSample: err.rawSample ?? null }).onConflictDoNothing();
  }
  async listEvents(sessionId: string): Promise<DomainEvent[]> {
    type Row = { id: string; seq: number; at: number; sessionId: string; provenanceKind: string; provenanceSource: string; endpoint: string | null; payload: unknown };
    const wrap = (r: Row, type: DomainEvent['type']): DomainEvent => ({
      v: 1, id: r.id.split('@')[0]!, seq: r.seq, at: r.at, sessionId: r.sessionId,
      provenance: { kind: r.provenanceKind, source: r.provenanceSource, endpoint: r.endpoint ?? undefined } as DomainEvent['provenance'],
      type, payload: r.payload as never,
    }) as DomainEvent;
    const [src, quotes, flows, sec, mkt] = await Promise.all([
      this.db.select().from(schema.sourceTradeEvents).where(eq(schema.sourceTradeEvents.sessionId, sessionId)),
      this.db.select().from(schema.quoteObservations).where(eq(schema.quoteObservations.sessionId, sessionId)),
      this.db.select().from(schema.competingFlowObservations).where(eq(schema.competingFlowObservations.sessionId, sessionId)),
      this.db.select().from(schema.securitySnapshots).where(eq(schema.securitySnapshots.sessionId, sessionId)),
      this.db.select().from(schema.marketSnapshots).where(eq(schema.marketSnapshots.sessionId, sessionId)),
    ]);
    const out: DomainEvent[] = [
      ...src.map((r) => wrap(r, `source.${r.kind}` as DomainEvent['type'])),
      ...quotes.map((r) => wrap(r, 'quote.observed')),
      ...flows.map((r) => wrap(r, 'flow.competing')),
      ...sec.map((r) => wrap(r, 'security.snapshot')),
      ...mkt.map((r) => wrap(r, 'market.snapshot')),
    ];
    return out.sort((a, b) => a.seq - b.seq);
  }
  async listSessions(limit = 50) {
    const rows = await this.db
      .select({ sessionId: schema.sourceTradeEvents.sessionId, events: sql<number>`count(*)`, firstAt: sql<string>`min(${schema.sourceTradeEvents.ingestedAt})` })
      .from(schema.sourceTradeEvents)
      .groupBy(schema.sourceTradeEvents.sessionId)
      .orderBy(desc(sql`min(${schema.sourceTradeEvents.ingestedAt})`))
      .limit(limit);
    return rows.map((r) => ({ sessionId: r.sessionId, events: Number(r.events), firstAt: new Date(r.firstAt).toISOString() }));
  }
  async ping() {
    try { await this.sql`select 1`; return true; } catch { return false; }
  }
  async close() { await this.sql.end({ timeout: 2 }); }
}
