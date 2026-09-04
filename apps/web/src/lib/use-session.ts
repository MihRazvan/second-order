'use client';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { SessionStore, type SessionSnapshot } from './session-store';

export const STREAM_URL = process.env.NEXT_PUBLIC_STREAM_URL ?? 'http://localhost:4010';

export function useSession(replayId?: string): { snap: SessionSnapshot; store: SessionStore } {
  const store = useMemo(() => new SessionStore(STREAM_URL, replayId), [replayId]);
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { void store.arm(); return () => store.destroy(); }, [store]);
  return { snap, store };
}

/** Event-time clock that advances smoothly between frames while a replay runs. */
export function useEventClock(snap: SessionSnapshot, fps = 30): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (snap.phase !== 'running' || snap.startedAtWall === null) { setNow(snap.eventTime); return; }
    const id = setInterval(() => {
      const wall = (Date.now() - snap.startedAtWall!) * snap.speed;
      setNow(Math.max(snap.eventTime, Math.min(wall, snap.eventTime + 1500)));
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [snap.phase, snap.startedAtWall, snap.speed, snap.eventTime, fps]);
  return now;
}
