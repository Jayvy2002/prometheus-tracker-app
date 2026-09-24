import { useCallback, useEffect, useState } from 'react';
import { fetchConstraints, setConstraintStatus, updateConstraint } from '../api/constraintsApi';
import type { AthleteConstraint, ConstraintEvent, ConstraintPersistence } from '../domain/constraints';

export function useConstraints(userId: string | null | undefined) {
  const [rows, setRows] = useState<AthleteConstraint[]>([]);
  const [events, setEvents] = useState<ConstraintEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const result = await fetchConstraints(userId);
    setLoading(false);
    setError(result.error);
    if (!result.error) {
      setRows(result.rows);
      setEvents(result.events);
    }
  }, [userId]);

  useEffect(() => { void reload(); }, [reload]);

  const run = useCallback(async (op: () => Promise<{ error: string | null }>) => {
    if (busy) return { error: 'busy' };
    setBusy(true);
    const result = await op();
    setBusy(false);
    if (!result.error) await reload();
    return result;
  }, [busy, reload]);

  return {
    rows,
    events,
    loading,
    error,
    busy,
    reload,
    update: (id: string, patch: { severity?: number | null; persistence?: ConstraintPersistence | null; note?: string }) =>
      run(() => updateConstraint(id, patch)),
    setStatus: (id: string, status: 'open' | 'resolved', note?: string) => run(() => setConstraintStatus(id, status, note)),
  };
}
