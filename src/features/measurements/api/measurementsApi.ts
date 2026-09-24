import { supabase } from '../../../lib/supabase';
import type { BodyMeasurement, MeasurementEntry, MeasurementSite } from '../domain/measurements';

export async function fetchMeasurements(userId: string): Promise<{ rows: BodyMeasurement[]; error: string | null }> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('id, user_id, measured_at, site, value_cm, note')
    .eq('user_id', userId)
    .order('measured_at', { ascending: false })
    .limit(2000);
  return {
    rows: ((data ?? []) as BodyMeasurement[]).map(row => ({ ...row, value_cm: Number(row.value_cm) })),
    error: error?.message ?? null,
  };
}

/**
 * Saves one day: filled sites are written (a retry rewrites the same value),
 * sites cleared in the form are removed for that day only.
 */
export async function saveMeasurementDay(
  userId: string,
  day: string,
  entries: MeasurementEntry[],
  cleared: MeasurementSite[],
): Promise<{ error: string | null }> {
  if (entries.length) {
    const { error } = await supabase
      .from('body_measurements')
      .upsert(
        entries.map(entry => ({ user_id: userId, measured_at: day, site: entry.site, value_cm: entry.value_cm, updated_at: new Date().toISOString() })),
        { onConflict: 'user_id,measured_at,site' },
      );
    if (error) return { error: error.message };
  }
  if (cleared.length) {
    const { error } = await supabase
      .from('body_measurements')
      .delete()
      .eq('user_id', userId)
      .eq('measured_at', day)
      .in('site', cleared);
    if (error) return { error: error.message };
  }
  return { error: null };
}

export async function deleteMeasurementDay(userId: string, day: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('body_measurements').delete().eq('user_id', userId).eq('measured_at', day);
  return { error: error?.message ?? null };
}
