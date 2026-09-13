export type RelationshipAccess = 'checking' | 'allowed' | 'ended' | 'unavailable';

type LinkChangePayload = {
  eventType?: string;
  new?: { status?: unknown } | null;
  old?: { status?: unknown } | null;
};

/** Bookkeeping (last visit) must not hide a dossier the coach already opened. */
export function relationshipLinkChangeNeedsRecheck(payload: LinkChangePayload): boolean {
  if (payload.eventType !== 'UPDATE') return true;
  const next = payload.new?.status;
  const prev = payload.old?.status;
  if (next === 'active' && (prev === 'active' || prev == null)) return false;
  return true;
}

/** Fail closed and discard reads started before an invalidation or unmount. */
export function createRelationshipAccess(
  read: () => Promise<boolean>,
  publish: (state: RelationshipAccess) => void,
) {
  let generation = 0;
  let disposed = false;
  return {
    async check(hideWhileChecking = true) {
      const ticket = ++generation;
      if (disposed) return;
      if (hideWhileChecking) publish('checking');
      try {
        const allowed = await read();
        if (!disposed && ticket === generation) publish(allowed ? 'allowed' : 'ended');
      } catch {
        if (!disposed && ticket === generation) publish('unavailable');
      }
    },
    invalidate(state: 'checking' | 'ended' | 'unavailable') {
      generation++;
      if (!disposed) publish(state);
    },
    dispose() { disposed = true; generation++; },
  };
}
