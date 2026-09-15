import { supabase } from '../../../lib/supabase';
import { isTransportError, type OfflineOp } from '../../../lib/offlineQueue';
import { offlineTempId } from './offlineIds';

interface ReplayResult {
  error?: string;
  transport?: boolean;
  /** Id serveur d'une création (mappé depuis l'id temporaire). */
  realId?: string;
  /** Mappings temporaires → réels supplémentaires (séries restaurées). */
  extraMaps?: Array<[string, string]>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * D07 : rejoue UNE op sur le serveur. Les créations portent client_op_id :
 * un retry après succès partiel retrouve la ligne (23505 → lecture).
 */
export async function replayOfflineOp(
  op: OfflineOp,
  mapId: (id: string) => string,
): Promise<ReplayResult> {
  const p = op.payload;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  try {
    switch (op.type) {
      case 'workout.create': {
        const { data, error } = await supabase
          .from('workouts')
          .insert({ ...(asRecord(p.workout)), client_op_id: op.id })
          .select()
          .maybeSingle();
        if (!error && data) return { realId: (data as { id: string }).id };
        if (error?.code === '23505') {
          const { data: existing } = await supabase
            .from('workouts')
            .select('id')
            .eq('client_op_id', op.id)
            .maybeSingle();
          if (existing) return { realId: (existing as { id: string }).id };
        }
        if (error && isTransportError(error)) return { transport: true };
        return { error: error?.message ?? 'workout.create failed' };
      }
      case 'workout.update': {
        const { error } = await supabase
          .from('workouts')
          .update({ ...(asRecord(p.updates)), updated_at: new Date().toISOString() })
          .eq('id', mapId(str(p.id)));
        if (!error) return {};
        if (isTransportError(error)) return { transport: true };
        return { error: error.message ?? 'workout.update failed' };
      }
      case 'workout.delete': {
        const { error } = await supabase
          .from('workouts')
          .delete()
          .eq('id', mapId(str(p.id)));
        if (!error) return {};
        if (isTransportError(error)) return { transport: true };
        return { error: error.message ?? 'workout.delete failed' };
      }
      case 'exercise.add': {
        const { data, error } = await supabase
          .from('workout_exercises')
          .insert({ ...(asRecord(p.exercise)), workout_id: mapId(str(p.workoutId)), client_op_id: op.id })
          .select()
          .maybeSingle();
        if (!error && data) return { realId: (data as { id: string }).id };
        if (error?.code === '23505') {
          const { data: existing } = await supabase
            .from('workout_exercises')
            .select('id')
            .eq('client_op_id', op.id)
            .maybeSingle();
          if (existing) return { realId: (existing as { id: string }).id };
        }
        if (error && isTransportError(error)) return { transport: true };
        return { error: error?.message ?? 'exercise.add failed' };
      }
      case 'exercise.update': {
        const { error } = await supabase
          .from('workout_exercises')
          .update(asRecord(p.updates))
          .eq('id', mapId(str(p.id)));
        if (!error) return {};
        if (isTransportError(error)) return { transport: true };
        return { error: error.message ?? 'exercise.update failed' };
      }
      case 'exercise.delete': {
        const { error } = await supabase
          .from('workout_exercises')
          .delete()
          .eq('id', mapId(str(p.id)));
        if (!error) return {};
        if (isTransportError(error)) return { transport: true };
        return { error: error.message ?? 'exercise.delete failed' };
      }
      case 'exercise.restore': {
        // Restauration rejouée comme création (+ séries déterministes).
        const row = { ...(asRecord(p.row)) };
        delete (row as Record<string, unknown>).id;
        row.workout_id = mapId(str(row.workout_id));
        (row as Record<string, unknown>).client_op_id = op.id;
        let exerciseId: string | null = null;
        {
          const { data, error } = await supabase.from('workout_exercises').insert(row).select().maybeSingle();
          if (!error && data) exerciseId = (data as { id: string }).id;
          else if (error?.code === '23505') {
            const { data: existing } = await supabase
              .from('workout_exercises')
              .select('id')
              .eq('client_op_id', op.id)
              .maybeSingle();
            if (existing) exerciseId = (existing as { id: string }).id;
          } else {
            if (error && isTransportError(error)) return { transport: true };
            return { error: error?.message ?? 'exercise.restore failed' };
          }
        }
        if (!exerciseId) return { error: 'exercise.restore failed' };
        const sets = Array.isArray(p.sets) ? p.sets : [];
        for (let i = 0; i < sets.length; i++) {
          const setRow = { ...(asRecord(sets[i])) };
          delete (setRow as Record<string, unknown>).id;
          setRow.exercise_id = exerciseId;
          (setRow as Record<string, unknown>).client_op_id = `${op.id}:set:${i}`;
          const { error } = await supabase.from('workout_sets').insert(setRow);
          if (error && error.code !== '23505') {
            if (isTransportError(error)) return { transport: true };
            return { error: error.message ?? 'exercise.restore sets failed' };
          }
        }
        // Mappe les ids temporaires des séries pour les ops suivantes.
        const extraMaps: Array<[string, string]> = [];
        if (sets.length > 0) {
          const { data: createdSets } = await supabase
            .from('workout_sets')
            .select('id, client_op_id')
            .eq('exercise_id', exerciseId)
            .like('client_op_id', `${op.id}:set:%`);
          for (const row of (createdSets ?? []) as Array<{ id: string; client_op_id: string }>) {
            const suffix = row.client_op_id.slice(`${op.id}:set:`.length);
            extraMaps.push([`${offlineTempId(op.id)}:set:${suffix}`, row.id]);
          }
        }
        return { realId: exerciseId, extraMaps };
      }
      case 'set.restore': {
        const row = { ...(asRecord(p.row)) };
        delete (row as Record<string, unknown>).id;
        row.exercise_id = mapId(str(row.exercise_id));
        (row as Record<string, unknown>).client_op_id = op.id;
        const { data, error } = await supabase.from('workout_sets').insert(row).select().maybeSingle();
        if (!error && data) return { realId: (data as { id: string }).id };
        if (error?.code === '23505') {
          const { data: existing } = await supabase
            .from('workout_sets')
            .select('id')
            .eq('client_op_id', op.id)
            .maybeSingle();
          if (existing) return { realId: (existing as { id: string }).id };
        }
        if (error && isTransportError(error)) return { transport: true };
        return { error: error?.message ?? 'set.restore failed' };
      }
      case 'set.add': {
        const { data, error } = await supabase
          .from('workout_sets')
          .insert({ ...(asRecord(p.set)), exercise_id: mapId(str(p.exerciseId)), client_op_id: op.id })
          .select()
          .maybeSingle();
        if (!error && data) return { realId: (data as { id: string }).id };
        if (error?.code === '23505') {
          const { data: existing } = await supabase
            .from('workout_sets')
            .select('id')
            .eq('client_op_id', op.id)
            .maybeSingle();
          if (existing) return { realId: (existing as { id: string }).id };
        }
        if (error && isTransportError(error)) return { transport: true };
        return { error: error?.message ?? 'set.add failed' };
      }
      case 'set.update': {
        const { error } = await supabase
          .from('workout_sets')
          .update(asRecord(p.updates))
          .eq('id', mapId(str(p.id)));
        if (!error) return {};
        if (isTransportError(error)) return { transport: true };
        return { error: error.message ?? 'set.update failed' };
      }
      case 'set.delete': {
        const { error } = await supabase
          .from('workout_sets')
          .delete()
          .eq('id', mapId(str(p.id)));
        if (!error) return {};
        if (isTransportError(error)) return { transport: true };
        return { error: error.message ?? 'set.delete failed' };
      }
      case 'superset.link': {
        const ids = (Array.isArray(p.exerciseIds) ? p.exerciseIds : []).map(v => mapId(str(v)));
        const { error } = await supabase
          .from('workout_exercises')
          .update({ superset_group_id: str(p.groupId) })
          .in('id', ids);
        if (!error) return {};
        if (isTransportError(error)) return { transport: true };
        return { error: error.message ?? 'superset.link failed' };
      }
      case 'superset.unlink': {
        // Note : le nettoyage "dernier du groupe" est local ; le rejeu annule
        // le seul exercice (divergence cosmétique possible, résorbée au prochain lien).
        const { error } = await supabase
          .from('workout_exercises')
          .update({ superset_group_id: null })
          .eq('id', mapId(str(p.exerciseId)));
        if (!error) return {};
        if (isTransportError(error)) return { transport: true };
        return { error: error.message ?? 'superset.unlink failed' };
      }
      default:
        return { error: `unknown op ${op.type}` };
    }
  } catch (err) {
    if (isTransportError(err)) return { transport: true };
    return { error: err instanceof Error ? err.message : 'replay failed' };
  }
}
