import { useCallback, useEffect, useState } from 'react';
import { fetchMyEntitlements } from '../api/entitlementsApi';
import type { MyEntitlements } from '../domain/entitlements';

export type EntitlementsState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; data: MyEntitlements };

/** Loading, error (with retry) and ready stay distinct: an error is not « no access ». */
export function useMyEntitlements(userId: string | undefined): EntitlementsState {
  const [state, setState] = useState<EntitlementsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setState({ status: 'loading' });
    void fetchMyEntitlements().then(result => {
      if (cancelled) return;
      if (result.error || !result.data) setState({ status: 'error', retry });
      else setState({ status: 'ready', data: result.data });
    }).catch(() => {
      if (!cancelled) setState({ status: 'error', retry });
    });
    return () => { cancelled = true; };
  }, [userId, attempt, retry]);

  return state;
}
