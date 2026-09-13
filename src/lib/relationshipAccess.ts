export type RelationshipAccess = 'checking' | 'allowed' | 'ended' | 'unavailable';

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
