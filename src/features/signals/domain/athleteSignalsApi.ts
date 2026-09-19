import { supabase } from '../../../lib/supabase';
import type { AthleteSignal } from '../types';
import type { WatchQueryResult } from './watchQuery';

export async function listOpenAthleteSignals(athleteId: string): Promise<WatchQueryResult<AthleteSignal[]>> {
  const { data, error } = await supabase
    .from('athlete_signals')
    .select('*')
    .eq('athlete_id', athleteId)
    .in('status', ['open', 'waiting']);
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: Array.isArray(data) ? data as AthleteSignal[] : [] };
}

export async function listOpenAthleteSignalsBestEffort(athleteId: string): Promise<AthleteSignal[]> {
  const result = await listOpenAthleteSignals(athleteId);
  return result.ok ? result.data : [];
}

export async function listAthleteSignalsForWatch(athleteId: string): Promise<WatchQueryResult<AthleteSignal[]>> {
  return listOpenAthleteSignals(athleteId);
}
