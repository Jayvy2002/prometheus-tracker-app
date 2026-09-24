import { supabase } from '../../../lib/supabase';
import type { Goal } from '../../goals/domain/goalLifecycle';

/**
 * Goals that can still be « current » for these clients (RLS: only the
 * athlete or their active coach reads them). Closed goals are history.
 */
export async function fetchCurrentGoalRows(clientIds: readonly string[]): Promise<{ rows: Goal[]; error: string | null }> {
  if (clientIds.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase
    .from('athlete_goals')
    .select('*')
    .in('user_id', [...clientIds])
    .in('status', ['active', 'maintenance', 'paused']);
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as Goal[], error: null };
}
