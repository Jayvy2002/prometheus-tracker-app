import { useCallback, useEffect, useState } from 'react';
import { cancelAccountDeletion, fetchAccountDeletion } from '../api/accountDeletionApi';
import type { AccountDeletionState } from '../domain/accountDeletion';

/**
 * Own deletion request. `ready` stays false until the first answer so the app
 * never flashes before the recovery screen. A read error does not block the
 * app (the server still enforces the purge date).
 */
export function useAccountDeletion(userId: string | null | undefined) {
  const [state, setState] = useState<AccountDeletionState>({ status: 'none', purgeAfter: null });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setState({ status: 'none', purgeAfter: null });
      setReady(true);
      return;
    }
    const result = await fetchAccountDeletion(userId);
    if (!result.error) setState(result.state);
    setReady(true);
  }, [userId]);

  useEffect(() => {
    setReady(false);
    void reload();
    const onChange = () => { void reload(); };
    window.addEventListener('prometheus:account-deletion', onChange);
    return () => window.removeEventListener('prometheus:account-deletion', onChange);
  }, [reload]);

  const cancel = useCallback(async () => {
    setBusy(true);
    const result = await cancelAccountDeletion();
    setBusy(false);
    if (!result.error) await reload();
    return result;
  }, [reload]);

  return { state, ready, busy, reload, cancel };
}

/** Lets the Profile tell the router that a request was just made. */
export function notifyAccountDeletionChanged(): void {
  window.dispatchEvent(new Event('prometheus:account-deletion'));
}
