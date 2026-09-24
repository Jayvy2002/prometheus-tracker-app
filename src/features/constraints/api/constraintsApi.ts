import { supabase } from '../../../lib/supabase';
import { enqueueOfflineOp, isTransportError } from '../../../lib/offlineQueue';
import { referencesOfflineTempId } from '../../workout/data/offlineIds';
import { areaFor, type AthleteConstraint, type ConstraintEvent, type ConstraintPersistence, type DeclareConstraintInput } from '../domain/constraints';

export async function fetchConstraints(userId: string): Promise<{ rows: AthleteConstraint[]; events: ConstraintEvent[]; error: string | null }> {
  const [rowsRes, eventsRes] = await Promise.all([
    supabase.from('athlete_constraints').select('*').eq('user_id', userId).order('declared_at', { ascending: false }),
    supabase.from('athlete_constraint_events').select('*').eq('user_id', userId).order('occurred_at', { ascending: false }).limit(300),
  ]);
  return {
    rows: (rowsRes.data ?? []) as AthleteConstraint[],
    events: (eventsRes.data ?? []) as ConstraintEvent[],
    error: rowsRes.error?.message ?? eventsRes.error?.message ?? null,
  };
}

/**
 * Declares online, or queues it when the network is gone (Vision §26: the
 * session keeps working). `queued` is reported honestly: saved ≠ synced.
 */
export async function declareConstraint(input: DeclareConstraintInput): Promise<{ error: string | null; queued: boolean }> {
  const payload = {
    userId: input.userId,
    kind: input.kind,
    bodyArea: areaFor(input.kind, input.bodyArea),
    description: (input.description ?? '').trim(),
    severity: input.severity ?? null,
    persistence: input.persistence,
    exerciseName: input.exerciseName ?? null,
    workoutId: input.workoutId ?? null,
  };
  const queue = () => {
    const queued = enqueueOfflineOp('constraint.declare', payload);
    return queued.ok ? { error: null, queued: true } : { error: queued.error ?? 'queue_failed', queued: false };
  };
  // A session started offline has no server id yet: the declaration waits behind it in the queue.
  const workoutIsLocal = referencesOfflineTempId(payload.workoutId);
  if ((typeof navigator !== 'undefined' && navigator.onLine === false) || workoutIsLocal) return queue();
  const { error } = await supabase.rpc('declare_constraint', {
    p_user: payload.userId,
    p_kind: payload.kind,
    p_body_area: payload.bodyArea,
    p_description: payload.description,
    p_severity: payload.severity,
    p_persistence: payload.persistence,
    p_exercise_name: payload.exerciseName,
    p_workout_id: payload.workoutId,
  });
  if (error && isTransportError(error)) return queue();
  return { error: error?.message ?? null, queued: false };
}

export async function updateConstraint(id: string, patch: { severity?: number | null; persistence?: ConstraintPersistence | null; note?: string }): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_constraint', {
    p_id: id,
    p_severity: patch.severity ?? null,
    p_persistence: patch.persistence ?? null,
    p_note: patch.note ?? '',
  });
  return { error: error?.message ?? null };
}

export async function setConstraintStatus(id: string, status: 'open' | 'resolved', note = ''): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_constraint_status', { p_id: id, p_status: status, p_note: note });
  return { error: error?.message ?? null };
}
