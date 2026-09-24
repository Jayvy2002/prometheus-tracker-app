import { useCallback, useEffect, useState } from 'react';
import { deleteMeasurementDay, fetchMeasurements, saveMeasurementDay } from '../api/measurementsApi';
import type { BodyMeasurement, MeasurementEntry, MeasurementSite } from '../domain/measurements';

/** Measurements of one athlete: their own (write) or a client's (read-only, RLS decides). */
export function useMeasurements(userId: string | null | undefined) {
  const [rows, setRows] = useState<BodyMeasurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const result = await fetchMeasurements(userId);
    setLoading(false);
    setError(result.error);
    if (!result.error) setRows(result.rows);
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
    loading,
    error,
    busy,
    reload,
    saveDay: (day: string, entries: MeasurementEntry[], cleared: MeasurementSite[]) =>
      userId ? run(() => saveMeasurementDay(userId, day, entries, cleared)) : Promise.resolve({ error: 'no_user' }),
    deleteDay: (day: string) =>
      userId ? run(() => deleteMeasurementDay(userId, day)) : Promise.resolve({ error: 'no_user' }),
  };
}
