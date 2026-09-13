export const ACCOUNT_CONTEXT_REFRESH_MS = 30_000;

/** Coalesces focus/online/timer signals so account reads never overlap. */
export function createAccountContextRefresh(refresh: () => Promise<void>) {
  let disposed = false;
  let queued = false;
  let pending: Promise<void> | null = null;
  return {
    request(): Promise<void> {
      if (disposed) return Promise.resolve();
      queued = true;
      if (!pending) {
        pending = (async () => {
          while (queued && !disposed) {
            queued = false;
            await refresh();
          }
        })().finally(() => { pending = null; });
      }
      return pending;
    },
    dispose(): void {
      disposed = true;
      queued = false;
    },
  };
}
