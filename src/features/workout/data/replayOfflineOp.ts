import { supabase } from '../../../lib/supabase';
import { isTransportError, type OfflineOp } from '../../../lib/offlineQueue';
import { offlineTempId, referencesOfflineTempId } from './offlineIds';
import { mapOfflineStartShape, type OfflineStartShape } from '../domain/offlineStart';

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
      case 'workout.startTemplate': {
        // Vision §26: the server command is idempotent on op.id, so a lost
        // response replays into the same session, never a second one.
        const { data, error } = await supabase.rpc('start_workout_from_template_op', {
          p_client_op_id: op.id,
          p_name: str(p.name),
          p_date: str(p.date) || null,
          p_routine_id: str(p.routineId) || null,
          p_program_assignment_id: str(p.programAssignmentId) || null,
          p_program_day_id: str(p.programDayId) || null,
          p_exercises: Array.isArray(p.exercises) ? p.exercises : [],
        });
        if (!error && data) {
          const pairs = mapOfflineStartShape(op.id, data as OfflineStartShape);
          const [, realId] = pairs[0];
          return { realId, extraMaps: pairs.slice(1) };
        }
        if (error && isTransportError(error)) return { transport: true };
        return { error: error?.message ?? 'workout.startTemplate failed' };
      }
      case 'constraint.declare': {
        // Vision §7.6 + §26: a pain reported mid-session without network reaches
        // the athlete's record once (declare_constraint is idempotent on op.id).
        const workoutId = str(p.workoutId) ? mapId(str(p.workoutId)) : '';
        const { error } = await supabase.rpc('declare_constraint', {
          p_user: str(p.userId),
          p_kind: str(p.kind),
          p_body_area: str(p.bodyArea) || 'other',
          p_description: str(p.description),
          p_severity: typeof p.severity === 'number' ? p.severity : null,
          p_persistence: str(p.persistence) || 'temporary',
          p_exercise_name: str(p.exerciseName) || null,
          // A session still waiting for its server id is not sent as a fake uuid.
          p_workout_id: workoutId && !referencesOfflineTempId(workoutId) ? workoutId : null,
          p_client_op_id: op.id,
        });
        // Nothing local points at a constraint: no id to map.
        if (!error) return {};
        if (isTransportError(error)) return { transport: true };
        return { error: error.message };
      }
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
