import { useCallback, useEffect, useState } from 'react';
import { allSettled } from '../domain/dashboardHome';

/** Past this, a card that never answered (hung request) no longer holds the others back. */
export const SETTLE_TIMEOUT_MS = 4000;

/**
 * Cards that fetch on their own (Prometheus watch line, program proposal,
 * two-week review) mount hidden and are revealed together once each one has
 * answered — shown or not. The page never jumps as they arrive one by one.
 * Once revealed the group stays revealed: later changes come from the user.
 */
export function useSettledReveal(expected: readonly string[], timeoutMs = SETTLE_TIMEOUT_MS) {
  const [settled, setSettled] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const ready = allSettled(expected, settled);

  const settle = useCallback((key: string) => {
    setSettled(prev => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  useEffect(() => {
    if (ready) setRevealed(true);
  }, [ready]);

  useEffect(() => {
    const id = window.setTimeout(() => setRevealed(true), timeoutMs);
    return () => window.clearTimeout(id);
  }, [timeoutMs]);

  return { revealed: revealed || ready, settle };
}
