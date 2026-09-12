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
