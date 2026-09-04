/**
 * Mobula live data source. Milestone 5 fills in the REST/WSS adapters; until then the
 * source reports its capabilities honestly and refuses to start a session.
 */
import type { DomainEvent } from '@second-order/contracts';
import type { Config } from '../../config.js';
import type { CapabilityReport, DataSource, SessionSpec } from '../types.js';

export function createMobulaDataSource(config: Config): DataSource {
  return {
    kind: 'mobula',
    provenanceKind: () => 'live-witnessed',
    async capabilities(): Promise<CapabilityReport> {
      return {
        provider: 'mobula',
        capabilities: {
          'wallet-trades-v2': config.MOBULA_API_KEY ? 'unknown' : 'disabled',
          'wallet-analysis': config.MOBULA_API_KEY ? 'unknown' : 'disabled',
          'token-security': config.MOBULA_API_KEY ? 'unknown' : 'disabled',
          'market-details': config.MOBULA_API_KEY ? 'unknown' : 'disabled',
          'swap-quoting-rest': config.MOBULA_API_KEY ? 'unknown' : 'disabled',
          'quoting-wss': config.MOBULA_API_KEY ? 'unknown' : 'disabled',
          'fast-trade-wss': config.MOBULA_API_KEY ? 'unknown' : 'disabled',
        },
        checkedAt: new Date().toISOString(),
      };
    },
    // eslint-disable-next-line require-yield
    async *start(_spec: SessionSpec, _signal: AbortSignal): AsyncIterable<DomainEvent> {
      throw Object.assign(new Error('Live Mobula sessions arrive in Milestone 5'), { code: 'NOT_IMPLEMENTED', status: 501 });
    },
  };
}
