import { createGeneration, getSessionGeneration, getSessionOwner } from './sessionScope';

/** One read channel per store domain. Invalidated on reset or a role mutation. */
export function createAccountRequestGuard() {
  const requests = createGeneration();
  return {
    invalidate: () => { requests.next(); },
    begin(accountId: string): (() => boolean) | null {
      // A stale caller must not invalidate a current account's pending request.
      if (getSessionOwner() !== accountId) return null;
      const request = requests.next();
      const session = getSessionGeneration();
      return () => getSessionOwner() === accountId
        && getSessionGeneration() === session && !requests.isStale(request);
    },
  };
}

/** Serialize role writes in one session; an old completion cannot unlock a new one. */
export function createAccountMutationGuard() {
  const generation = createGeneration();
  let active: number | null = null;
  let session = getSessionGeneration();
  const syncSession = () => {
    if (session === getSessionGeneration()) return;
    session = getSessionGeneration();
    generation.next();
    active = null;
  };
  return {
    invalidate() { generation.next(); active = null; },
    pending() { syncSession(); return active !== null; },
    begin(accountId: string) {
      syncSession();
      if (getSessionOwner() !== accountId || active !== null) return null;
      const ticket = generation.next();
      const operationSession = session;
      active = ticket;
      return {
        isCurrent: () => getSessionOwner() === accountId
          && getSessionGeneration() === operationSession && !generation.isStale(ticket),
        finish: () => { if (active === ticket) active = null; },
      };
    },
  };
}
