import { ReplayFile, type ReplayManifest } from '@second-order/contracts';
import demoCrowdCapture from '../fixtures/demo-crowd-capture.v1.json';
import reconCbbtcHoneypot from '../fixtures/recon-base-cbbtc-honeypot.v1.json';
import reconFlock from '../fixtures/recon-base-flock.v1.json';

export const DEMO_REPLAY_ID = 'demo-crowd-capture.v1';

/** Bundled replays: the calibrated demo scenario plus real reconstructions captured from Mobula history. */
const files: Record<string, unknown> = {
  [DEMO_REPLAY_ID]: demoCrowdCapture,
  'recon-base-cbbtc-honeypot.v1': reconCbbtcHoneypot,
  'recon-base-flock.v1': reconFlock,
};

export function listReplays(): ReplayManifest[] {
  return Object.values(files).map((f) => ReplayFile.parse(f).manifest);
}

export function loadReplay(id: string): ReplayFile | null {
  const raw = files[id];
  if (!raw) return null;
  return ReplayFile.parse(raw);
}
