import { createGeneration, getSessionOwner } from './sessionScope';

/** One read channel per store domain. Invalidated on reset or a role mutation. */
export function createAccountRequestGuard() {
  const requests = createGeneration();
  return {
    invalidate: () => { requests.next(); },
    begin(accountId: string): (() => boolean) | null {
      // A stale caller must not invalidate a current account's pending request.
      if (getSessionOwner() !== accountId) return null;
      const request = requests.next();
      return () => getSessionOwner() === accountId && !requests.isStale(request);
    },
  };
}

/** Serialize role writes in one session; an old completion cannot unlock a new one. */
export function createAccountMutationGuard() {
  const generation = createGeneration();
  let active: number | null = null;
  return {
    invalidate() { generation.next(); active = null; },
    pending() { return active !== null; },
    begin(accountId: string) {
      if (getSessionOwner() !== accountId || active !== null) return null;
      const ticket = generation.next();
      active = ticket;
      return {
        isCurrent: () => getSessionOwner() === accountId && !generation.isStale(ticket),
        finish: () => { if (active === ticket) active = null; },
      };
    },
  };
}
