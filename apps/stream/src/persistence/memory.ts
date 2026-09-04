import type { DomainEvent, ReplayManifest } from '@second-order/contracts';
import type { CapacityRow, Persistence, ProcessingError } from './types.js';

export class MemoryPersistence implements Persistence {
  readonly kind = 'memory' as const;
  private events = new Map<string, DomainEvent[]>();
  private ids = new Set<string>();
  readonly capacity: CapacityRow[] = [];
  readonly manifests = new Map<string, ReplayManifest>();
  readonly errors: ProcessingError[] = [];

  async saveEvent(event: DomainEvent) {
    if (this.ids.has(event.id + '@' + event.sessionId)) return false;
    this.ids.add(event.id + '@' + event.sessionId);
    const arr = this.events.get(event.sessionId) ?? [];
    arr.push(event);
    this.events.set(event.sessionId, arr);
    return true;
  }
  async saveCapacity(row: CapacityRow) { this.capacity.push(row); if (this.capacity.length > 5000) this.capacity.splice(0, 1000); }
  async saveManifest(m: ReplayManifest) { this.manifests.set(m.id, m); }
  async saveError(e: ProcessingError) { this.errors.push(e); if (this.errors.length > 500) this.errors.shift(); }
  async listEvents(sessionId: string) { return this.events.get(sessionId) ?? []; }
  async listSessions(limit = 50) { return [...this.events.entries()].slice(-limit).reverse().map(([sessionId, evs]) => ({ sessionId, events: evs.length, firstAt: new Date().toISOString() })); }
  async ping() { return true; }
  async close() {}
}
