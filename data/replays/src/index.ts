import { ReplayFile, type ReplayManifest } from '@second-order/contracts';
import demoCrowdCapture from '../fixtures/demo-crowd-capture.v1.json';

export const DEMO_REPLAY_ID = 'demo-crowd-capture.v1';

const files: Record<string, unknown> = {
  [DEMO_REPLAY_ID]: demoCrowdCapture,
};

export function listReplays(): ReplayManifest[] {
  return Object.values(files).map((f) => ReplayFile.parse(f).manifest);
}

export function loadReplay(id: string): ReplayFile | null {
  const raw = files[id];
  if (!raw) return null;
  return ReplayFile.parse(raw);
}
