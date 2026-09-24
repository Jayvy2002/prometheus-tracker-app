import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Workout, WorkoutExercise, WorkoutSet } from '../lib/types';
import { setCacheItem, getCacheItem, clearCacheItem, workoutCacheKey } from '../lib/offlineCache';
import { getSessionOwner, createGeneration } from '../lib/sessionScope';
import {
  enqueueOfflineOp,
  peekOfflineOps,
  peekDeadLetterOps,
  removeOfflineOp,
  markOfflineOpFailed,
  moveOfflineOpToDeadLetter,
  retryDeadLetterOp,
  loadIdMap,
  persistIdMap,
  isTransportError,
  type OfflineOp,
  type OfflineOpType,
} from '../lib/offlineQueue';
import { migrateFieldDraftIds } from '../lib/fieldDraftKeys';
import { parseDate, toLocalDateStr } from '../lib/utils';
import { track } from '../lib/telemetryClient';
import { useStreakStore } from './streakStore';
import { offlineTempId, isOfflineTempId, referencesOfflineTempId } from '../features/workout/data/offlineIds';
import { loadFullWorkout, type ExerciseSession, type PreviousSet } from '../features/workout/data/loadFullWorkout';
import { replayOfflineOp } from '../features/workout/data/replayOfflineOp';
import { buildOfflineStartedWorkout, type OfflineStartInput } from '../features/workout/domain/offlineStart';

export { offlineTempId, isOfflineTempId } from '../features/workout/data/offlineIds';
export type { ExerciseSession } from '../features/workout/data/loadFullWorkout';

/** S05 : invalide les réponses async après reset (logout / changement de compte). */
const workoutGeneration = createGeneration();

/** Q05 : taille de page de l'historique des séances. */
export const WORKOUTS_PAGE_SIZE = 200;

function takeQueuedOp(
  type: OfflineOpType,
  payload: Record<string, unknown>,
  accountId: string | null,
): OfflineOp | null {
  const queued = enqueueOfflineOp(type, payload, accountId);
  if (!queued.ok) {
    useWorkoutStore.setState({ queueBlocked: queued.error });
    return null;
  }
  useWorkoutStore.setState({ queueBlocked: null });
  return queued.op;
}

function queueCounts(accountId: string | null): { pendingOps: number; deadOps: number } {
  return {
    pendingOps: peekOfflineOps(accountId).length,
    deadOps: peekDeadLetterOps(accountId).length,
  };
}

interface SendResult {
  error: { message?: string; code?: string } | null;
}

/**
 * D07 : mutation avec file hors ligne. En ligne → serveur direct ; hors ligne
 * ou panne transport → op persistée (par compte) + application locale immédiate.
 * Une erreur applicative (RLS/validation) ne part jamais en file.
 */
async function guardedMutation(
  type: OfflineOpType,
  payload: Record<string, unknown>,
  applyLocal: () => void,
  send: () => Promise<SendResult>,
): Promise<{ error: string | null; queued: boolean }> {
  const owner = getSessionOwner();
  const queueIt = () => {
    const queued = enqueueOfflineOp(type, payload, owner);
    if (!queued.ok) {
      useWorkoutStore.setState({ queueBlocked: queued.error });
      return {
        error: queued.error === 'quota' ? 'quota' : 'Request failed',
        queued: false,
      };
    }
    applyLocal();
    useWorkoutStore.setState({
      ...queueCounts(owner),
      deadOps: peekDeadLetterOps(owner).length,
    });
    return { error: null as string | null, queued: true };
  };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return queueIt();
  // A temporary id only exists locally until its create op replays: sending it
  // now would fail on the server and lose the edit. It waits in the queue,
  // behind the op that will give it a real id.
  if (referencesOfflineTempId(payload)) return queueIt();
  try {
    const { error } = await send();
    if (!error) {
      applyLocal();
      return { error: null, queued: false };
    }
    if (isTransportError(error)) return queueIt();
    return { error: error.message ?? 'Request failed', queued: false };
  } catch (err) {
    if (isTransportError(err)) return queueIt();
    return { error: err instanceof Error ? err.message : 'Request failed', queued: false };
  }
}

interface WorkoutState {
  workouts: Workout[];
  currentWorkout: Workout | null;
  loading: boolean;
  /** D07 : opérations locales en attente de synchronisation (0 = à jour). */
  pendingOps: number;
  /** D07 : dead-letter visible et réessayable (jamais supprimée après 3 échecs). */
  deadOps: number;
  /** D07 : file locale saturée ou hors compte — l'UI affiche l'erreur, rien n'est jeté. */
  queueBlocked: 'quota' | 'no_account' | null;
  retryDeadLetter: (opId: string) => Promise<void>;
  /** Q05 : true quand tout l'historique est chargé (pas de troncature silencieuse). */
  workoutsExhausted: boolean;
  syncOfflineQueue: () => Promise<void>;
  refreshPendingOps: () => void;
  fetchWorkouts: (userId: string) => Promise<void>;
  /** Q05 : page suivante (plus anciennes) ; no-op si l'historique est complet. */
  fetchOlderWorkouts: (userId: string) => Promise<void>;
  fetchWorkout: (workoutId: string) => Promise<void>;
  peekWorkout: (workoutId: string) => Promise<Workout | null>;
  createWorkout: (workout: Partial<Workout>) => Promise<string | null>;
  /** Vision §26 : séance prévue démarrée sans réseau, rejouée plus tard sans doublon. */
  startTemplateOffline: (input: Omit<OfflineStartInput, 'opId' | 'userId'>) => string | null;
  updateWorkout: (id: string, data: Partial<Workout>) => Promise<{ error: string | null }>;
  reset: () => void;
  deleteWorkout: (id: string) => Promise<void>;
  addExercise: (workoutId: string, name: string, orderIndex: number, extras?: {
    prescribed_sets?: number;
    prescribed_reps?: number;
    prescribed_reps_min?: number | null;
    prescribed_rir?: number | null;
    prescribed_rest_seconds?: number | null;
    prescribed_weight_kg?: number | null;
    catalog_exercise_id?: string | null;
  }) => Promise<WorkoutExercise | null>;
  updateExercise: (id: string, data: Partial<WorkoutExercise>) => Promise<void>;
  deleteExercise: (id: string) => Promise<void>;
  addSet: (exerciseId: string, orderIndex: number) => Promise<WorkoutSet | null>;
  updateSet: (id: string, data: Partial<WorkoutSet>) => Promise<void>;
  deleteSet: (id: string) => Promise<void>;
  restoreSet: (exerciseId: string, setData: WorkoutSet) => Promise<void>;
  /** true once the exercise and its sets are back (or queued offline): undo never claims more. */
  restoreExercise: (workoutId: string, exerciseData: WorkoutExercise) => Promise<boolean>;
  setCurrentWorkout: (w: Workout | null) => void;
  linkSuperset: (exerciseIds: string[]) => Promise<void>;
  unlinkSuperset: (exerciseId: string) => Promise<void>;
  fetchPreviousSets: (userId: string, exerciseName: string, currentWorkoutId: string, catalogExerciseId?: string | null) => Promise<PreviousSet[]>;
  fetchExerciseHistory: (userId: string, exerciseName: string, currentWorkoutId: string, limit?: number, catalogExerciseId?: string | null) => Promise<ExerciseSession[]>;
}

let drainInFlight = false;

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  workouts: [],
  currentWorkout: null,
  loading: false,
  pendingOps: 0,
  deadOps: 0,
  queueBlocked: null,
  workoutsExhausted: false,

  refreshPendingOps: () => {
    set({
      pendingOps: peekOfflineOps().length,
      deadOps: peekDeadLetterOps().length,
    });
  },

  retryDeadLetter: async (opId) => {
    retryDeadLetterOp(opId);
    set({
      pendingOps: peekOfflineOps().length,
      deadOps: peekDeadLetterOps().length,
    });
    await get().syncOfflineQueue();
  },

  syncOfflineQueue: async () => {
    const owner = getSessionOwner();
    if (!owner || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    if (drainInFlight) return;
    drainInFlight = true;
    try {
      const idMap = loadIdMap(owner);
      const mapId = (id: string) => idMap.get(id) ?? id;
      let guard = 0;
      for (;;) {
        const ops = peekOfflineOps(owner);
        if (ops.length === 0 || guard++ > 500) break;
        const op = ops[0];
        const replayed = await replayOfflineOp(op, mapId);
        if (replayed.transport) break;
        if (replayed.error) {
          const current = peekOfflineOps(owner).find(o => o.id === op.id);
          const nextAttempts = (current?.attempts ?? op.attempts) + 1;
          if (nextAttempts >= 3) {
            moveOfflineOpToDeadLetter(op.id, replayed.error, owner);
          } else {
            markOfflineOpFailed(op.id, replayed.error, owner);
          }
          continue;
        }
        if (replayed.realId) idMap.set(offlineTempId(op.id), replayed.realId);
        for (const [temp, real] of replayed.extraMaps ?? []) idMap.set(temp, real);
        persistIdMap(idMap, owner);
        removeOfflineOp(op.id, owner);
      }
      persistIdMap(idMap, owner);
      const remaining = peekOfflineOps(owner).length;
      set({ pendingOps: remaining, deadOps: peekDeadLetterOps(owner).length });
      if (remaining === 0 && idMap.size > 0) {
        // Ids réels : les brouillons de saisie suivent, puis relecture serveur.
        const current = get().currentWorkout;
        if (current && isOfflineTempId(current.id) && idMap.has(current.id)) {
          const realId = idMap.get(current.id) as string;
          migrateFieldDraftIds(idMap, current.id, realId);
          clearCacheItem(workoutCacheKey(current.id));
          await get().fetchWorkouts(owner);
          await get().fetchWorkout(realId);
        } else {
          migrateFieldDraftIds(idMap, current?.id ?? '', current?.id ?? '');
          if (current) await get().fetchWorkout(current.id);
        }
      }
    } finally {
      drainInFlight = false;
    }
  },

  fetchWorkouts: async (userId) => {
    // Q05 : première page (200) + pagination explicite — fini le plafond muet à 500.
    set({ loading: true });
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .limit(WORKOUTS_PAGE_SIZE + 1);
    const rows = (data ?? []) as Workout[];
    set({
      workouts: rows.slice(0, WORKOUTS_PAGE_SIZE),
      workoutsExhausted: rows.length <= WORKOUTS_PAGE_SIZE,
      loading: false,
    });
  },

  fetchOlderWorkouts: async (userId) => {
    const current = get().workouts;
    if (get().workoutsExhausted || current.length === 0 || get().loading) return;
    set({ loading: true });
    const oldest = [...current].sort((a, b) =>
      a.date === b.date ? (a.id < b.id ? -1 : 1) : (a.date < b.date ? -1 : 1),
    )[0];
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', userId)
      .or(`date.lt.${oldest.date},and(date.eq.${oldest.date},id.lt.${oldest.id})`)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .limit(WORKOUTS_PAGE_SIZE + 1);
    const rows = (data ?? []) as Workout[];
    set(s => ({
      workouts: [...s.workouts, ...rows.slice(0, WORKOUTS_PAGE_SIZE)],
      workoutsExhausted: rows.length <= WORKOUTS_PAGE_SIZE,
      loading: false,
    }));
  },

  fetchWorkout: async (workoutId) => {
    const gen = workoutGeneration.capture();
    const owner = getSessionOwner();
    const cached = getCacheItem<Workout>(workoutCacheKey(workoutId));
    // D07 : une séance locale (id temporaire) ne vit qu'en cache + file offline.
    if (isOfflineTempId(workoutId)) {
      set({ currentWorkout: cached && (!owner || (cached as Workout).user_id === owner) ? cached : null });
      return;
    }
    // S05 : le cache est déjà namespacé par compte ; on valide en plus que la
    // séance appartient bien au compte courant avant de l'afficher.
    if (cached && owner && (cached as Workout).user_id === owner) {
      set({ currentWorkout: cached });
    }

    const fullWorkout = await loadFullWorkout(workoutId);
    if (workoutGeneration.isStale(gen)) return;
    if (!fullWorkout) {
      // Le serveur refuse ou ne connaît pas cette séance : ne jamais laisser
      // une valeur cache (ou d'un autre compte) affichée.
      clearCacheItem(workoutCacheKey(workoutId));
      set(s => (s.currentWorkout?.id === workoutId ? { currentWorkout: null } : s));
      return;
    }
    // Défense : le serveur n'aurait jamais dû renvoyer la séance d'un autre
    // compte (RLS), mais on refuse de l'afficher si ça arrive.
    if (owner && fullWorkout.user_id !== owner) {
      clearCacheItem(workoutCacheKey(workoutId));
      set(s => (s.currentWorkout?.id === workoutId ? { currentWorkout: null } : s));
      return;
    }
    set({ currentWorkout: fullWorkout });
    setCacheItem(workoutCacheKey(workoutId), fullWorkout);
  },

  peekWorkout: async (workoutId) => {
    const owner = getSessionOwner();
    const cached = getCacheItem<Workout>(workoutCacheKey(workoutId));
    if (isOfflineTempId(workoutId)) {
      return cached && (!owner || (cached as Workout).user_id === owner) ? cached : null;
    }
    if (cached?.exercises?.length && (!owner || (cached as Workout).user_id === owner)) return cached;
    const full = await loadFullWorkout(workoutId);
    if (full && owner && full.user_id !== owner) return null;
    if (full) setCacheItem(workoutCacheKey(workoutId), full);
    return full;
  },

  startTemplateOffline: (input) => {
    const owner = getSessionOwner();
    if (!owner) return null;
    const op = takeQueuedOp('workout.startTemplate', {
      name: input.name,
      date: input.date,
      routineId: input.routineId ?? null,
      programAssignmentId: input.programAssignmentId ?? null,
      programDayId: input.programDayId ?? null,
      exercises: input.exercises,
    }, owner);
    if (!op) return null;
    const temp = buildOfflineStartedWorkout({ ...input, opId: op.id, userId: owner });
    setCacheItem(workoutCacheKey(temp.id), temp);
    set(s => ({ workouts: [temp, ...s.workouts], currentWorkout: temp, ...queueCounts(owner) }));
    return temp.id;
  },

  createWorkout: async (workout) => {
    // D07 : op créée d'abord (client_op_id stable) — succès serveur = on la retire.
    const owner = getSessionOwner();
    const op = takeQueuedOp('workout.create', { workout: { ...workout } }, owner);
    const { data, error } = await supabase
      .from('workouts')
      .insert({ ...workout, client_op_id: op?.id ?? null })
      .select()
      .maybeSingle();
    if (!error && data) {
      if (op) removeOfflineOp(op.id, owner);
      const w = { ...data, exercises: [] } as Workout;
      set(s => ({ workouts: [w, ...s.workouts], currentWorkout: w, ...queueCounts(owner) }));
      return data.id;
    }
    if (error && !isTransportError(error)) {
      if (op) removeOfflineOp(op.id, owner);
      console.error('createWorkout error:', error.message);
      return null;
    }
    // Hors ligne : séance temporaire, synchronisée à la reconnexion.
    if (op) {
      const temp = { user_id: owner, ...workout, id: offlineTempId(op.id), exercises: [] } as unknown as Workout;
      setCacheItem(workoutCacheKey(temp.id), temp);
      set(s => ({
        workouts: [temp, ...s.workouts],
        currentWorkout: temp,
        ...queueCounts(owner),
      }));
      return temp.id;
    }
    console.error('createWorkout error:', error?.message ?? 'offline without account');
    return null;
  },

  updateWorkout: async (id, updates) => {
    const current = get().currentWorkout;
    const applyLocal = () => {
      if (current?.id === id) {
        const updated = { ...current, ...updates };
        set({ currentWorkout: updated });
        setCacheItem(workoutCacheKey(id), updated);
      }
      set(s => ({
        workouts: s.workouts.map(w => w.id === id ? { ...w, ...updates } : w),
      }));
    };
    const result = await guardedMutation(
      'workout.update',
      { id, updates: { ...updates } },
      applyLocal,
      async () => {
        const { error } = await supabase
          .from('workouts')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id);
        return { error };
      },
    );
    if (result.error) { console.error('updateWorkout failed:', result.error); return { error: result.error }; }
    if (!result.queued && updates.completed) {
      const workout = get().currentWorkout?.id === id
        ? { ...get().currentWorkout, ...updates }
        : get().workouts.find(w => w.id === id);
      track('workout_completed', {
        from_program: !!workout?.program_day_id,
        from_routine: !!workout?.routine_id,
        duration_seconds: workout?.duration_seconds ?? null,
      });
      if (workout?.user_id && workout.date) {
        void useStreakStore.getState().recordActivity(
          workout.user_id,
          toLocalDateStr(parseDate(workout.date)),
        );
      }
    }
    return { error: null };
  },

  deleteWorkout: async (id) => {
    await guardedMutation(
      'workout.delete',
      { id },
      () => {
        clearCacheItem(workoutCacheKey(id));
        set(s => ({
          workouts: s.workouts.filter(w => w.id !== id),
          currentWorkout: s.currentWorkout?.id === id ? null : s.currentWorkout,
        }));
      },
      async () => {
        const { error } = await supabase.from('workouts').delete().eq('id', id);
        return { error };
      },
    );
  },

  addExercise: async (workoutId, name, orderIndex, extras) => {
    const owner = getSessionOwner();
    const exercise = {
      name,
      order_index: orderIndex,
      prescribed_sets: extras?.prescribed_sets ?? null,
      prescribed_reps: extras?.prescribed_reps ?? null,
      prescribed_reps_min: extras?.prescribed_reps_min ?? null,
      prescribed_rir: extras?.prescribed_rir ?? null,
      prescribed_rest_seconds: extras?.prescribed_rest_seconds ?? null,
      prescribed_weight_kg: extras?.prescribed_weight_kg ?? null,
      prescription_source: 'user' as const,
      catalog_exercise_id: extras?.catalog_exercise_id ?? null,
    };
    const op = takeQueuedOp('exercise.add', { workoutId, exercise: { ...exercise } }, owner);
    const { data, error } = await supabase
      .from('workout_exercises')
      .insert({ workout_id: workoutId, ...exercise, client_op_id: op?.id ?? null })
      .select()
      .maybeSingle();
    if (!error && data) {
      if (op) removeOfflineOp(op.id, owner);
      const ex = { ...data, sets: [] } as WorkoutExercise;
      set(s => {
        if (!s.currentWorkout) return s;
        const updated = {
          ...s.currentWorkout,
          exercises: [...(s.currentWorkout.exercises ?? []), ex],
        };
        setCacheItem(workoutCacheKey(workoutId), updated);
        return { currentWorkout: updated, ...queueCounts(owner) };
      });
      return ex;
    }
    if (error && !isTransportError(error)) {
      if (op) removeOfflineOp(op.id, owner);
      console.error('addExercise failed:', error.message);
      return null;
    }
    if (!op) return null;
    const temp = { ...exercise, id: offlineTempId(op.id), workout_id: workoutId, sets: [] } as unknown as WorkoutExercise;
    set(s => {
      if (!s.currentWorkout) return s;
      const updated = {
        ...s.currentWorkout,
        exercises: [...(s.currentWorkout.exercises ?? []), temp],
      };
      setCacheItem(workoutCacheKey(workoutId), updated);
      return { currentWorkout: updated, ...queueCounts(owner) };
    });
    return temp;
  },

  updateExercise: async (id, updates) => {
    await guardedMutation(
      'exercise.update',
      { id, updates: { ...updates } },
      () => {
        set(s => {
          if (!s.currentWorkout) return s;
          return {
            currentWorkout: {
              ...s.currentWorkout,
              exercises: s.currentWorkout.exercises?.map(e =>
                e.id === id ? { ...e, ...updates } : e
              ),
            },
          };
        });
      },
      async () => {
        const { error } = await supabase.from('workout_exercises').update(updates).eq('id', id);
        return { error };
      },
    );
  },

  deleteExercise: async (id) => {
    await guardedMutation(
      'exercise.delete',
      { id },
      () => {
        set(s => {
          if (!s.currentWorkout) return s;
          const updated = {
            ...s.currentWorkout,
            exercises: s.currentWorkout.exercises?.filter(e => e.id !== id),
          };
          setCacheItem(workoutCacheKey(s.currentWorkout.id), updated);
          return { currentWorkout: updated };
        });
      },
      async () => {
        const { error } = await supabase.from('workout_exercises').delete().eq('id', id);
        return { error };
      },
    );
  },

  addSet: async (exerciseId, orderIndex) => {
    const owner = getSessionOwner();
    const op = takeQueuedOp('set.add', { exerciseId, set: { order_index: orderIndex } }, owner);
    const { data, error } = await supabase
      .from('workout_sets')
      .insert({ exercise_id: exerciseId, order_index: orderIndex, client_op_id: op?.id ?? null })
      .select()
      .maybeSingle();
    if (!error && data) {
      if (op) removeOfflineOp(op.id, owner);
      const newSet = data as WorkoutSet;
      set(s => {
        if (!s.currentWorkout) return s;
        const updated = {
          ...s.currentWorkout,
          exercises: s.currentWorkout.exercises?.map(e =>
            e.id === exerciseId
              ? { ...e, sets: [...(e.sets ?? []), newSet] }
              : e
          ),
        };
        setCacheItem(workoutCacheKey(s.currentWorkout.id), updated);
        return { currentWorkout: updated, ...queueCounts(owner) };
      });
      return newSet;
    }
    if (error && !isTransportError(error)) {
      if (op) removeOfflineOp(op.id, owner);
      console.error('addSet failed:', error.message);
      return null;
    }
    if (!op) return null;
    const temp = { id: offlineTempId(op.id), exercise_id: exerciseId, order_index: orderIndex } as unknown as WorkoutSet;
    set(s => {
      if (!s.currentWorkout) return s;
      const updated = {
        ...s.currentWorkout,
        exercises: s.currentWorkout.exercises?.map(e =>
          e.id === exerciseId
            ? { ...e, sets: [...(e.sets ?? []), temp] }
            : e
        ),
      };
      setCacheItem(workoutCacheKey(s.currentWorkout.id), updated);
      return { currentWorkout: updated, ...queueCounts(owner) };
    });
    return temp;
  },

  updateSet: async (id, updates) => {
    await guardedMutation(
      'set.update',
      { id, updates: { ...updates } },
      () => {
        set(s => {
          if (!s.currentWorkout) return s;
          const updated = {
            ...s.currentWorkout,
            exercises: s.currentWorkout.exercises?.map(e => ({
              ...e,
              sets: e.sets?.map(st => st.id === id ? { ...st, ...updates } : st),
            })),
          };
          setCacheItem(workoutCacheKey(s.currentWorkout.id), updated);
          return { currentWorkout: updated };
        });
      },
      async () => {
        const { error } = await supabase.from('workout_sets').update(updates).eq('id', id);
        return { error };
      },
    );
  },

  deleteSet: async (id) => {
    await guardedMutation(
      'set.delete',
      { id },
      () => {
        set(s => {
          if (!s.currentWorkout) return s;
          const updated = {
            ...s.currentWorkout,
            exercises: s.currentWorkout.exercises?.map(e => ({
              ...e,
              sets: e.sets?.filter(st => st.id !== id),
            })),
          };
          setCacheItem(workoutCacheKey(s.currentWorkout.id), updated);
          return { currentWorkout: updated };
        });
      },
      async () => {
        const { error } = await supabase.from('workout_sets').delete().eq('id', id);
        return { error };
      },
    );
  },

  restoreSet: async (exerciseId, setData) => {
    const owner = getSessionOwner();
    const row = {
      exercise_id: exerciseId,
      set_type: setData.set_type,
      weight_kg: setData.weight_kg,
      reps: setData.reps,
      rir: setData.rir,
      completed: setData.completed,
      order_index: setData.order_index,
      duration_seconds: setData.duration_seconds,
      tempo: setData.tempo,
      cluster_rest_seconds: setData.cluster_rest_seconds,
      cluster_reps_per_burst: setData.cluster_reps_per_burst,
      myo_is_activation: setData.myo_is_activation,
      drop_percentage: setData.drop_percentage,
    };
    const op = takeQueuedOp('set.restore', { row: { ...row } }, owner);
    const { data, error } = await supabase
      .from('workout_sets')
      .insert({ ...row, client_op_id: op?.id ?? null })
      .select()
      .maybeSingle();
    const restored = (!error && data ? data : null) as WorkoutSet | null;
    if (restored) {
      if (op) removeOfflineOp(op.id, owner);
    } else if (error && !isTransportError(error)) {
      if (op) removeOfflineOp(op.id, owner);
      console.error('restoreSet failed:', error.message);
      return;
    }
    if (!restored && !op) return;
    const restoredSet = (restored ?? { ...row, id: offlineTempId((op as { id: string }).id) }) as WorkoutSet;
    set(s => {
      if (!s.currentWorkout) return s;
      const updated = {
        ...s.currentWorkout,
        exercises: s.currentWorkout.exercises?.map(e =>
          e.id === exerciseId
            ? { ...e, sets: [...(e.sets ?? []), restoredSet].sort((a, b) => a.order_index - b.order_index) }
            : e
        ),
      };
      setCacheItem(workoutCacheKey(s.currentWorkout.id), updated);
      return { currentWorkout: updated, ...queueCounts(owner) };
    });
  },

  restoreExercise: async (workoutId, exerciseData) => {
    const owner = getSessionOwner();
    const row = {
      workout_id: workoutId,
      name: exerciseData.name,
      order_index: exerciseData.order_index,
      notes: exerciseData.notes,
      superset_group_id: exerciseData.superset_group_id,
      // The targets shown in the logger come back with the exercise.
      prescribed_sets: exerciseData.prescribed_sets ?? null,
      prescribed_reps: exerciseData.prescribed_reps ?? null,
      prescribed_reps_min: exerciseData.prescribed_reps_min ?? null,
      prescribed_rir: exerciseData.prescribed_rir ?? null,
      prescribed_rest_seconds: exerciseData.prescribed_rest_seconds ?? null,
      prescribed_weight_kg: exerciseData.prescribed_weight_kg ?? null,
      catalog_exercise_id: exerciseData.catalog_exercise_id ?? null,
    };
    const sets = (exerciseData.sets ?? []).map(s => ({
      set_type: s.set_type,
      weight_kg: s.weight_kg,
      reps: s.reps,
      rir: s.rir,
      completed: s.completed,
      order_index: s.order_index,
      duration_seconds: s.duration_seconds,
      tempo: s.tempo,
      cluster_rest_seconds: s.cluster_rest_seconds,
      cluster_reps_per_burst: s.cluster_reps_per_burst,
      myo_is_activation: s.myo_is_activation,
      drop_percentage: s.drop_percentage,
      drop_segments: s.drop_segments ?? null,
    }));
    const op = takeQueuedOp('exercise.restore', { row: { ...row }, sets }, owner);
    const { data: newEx, error: exError } = await supabase
      .from('workout_exercises')
      .insert({ ...row, client_op_id: op?.id ?? null })
      .select()
      .maybeSingle();
    if ((exError && !isTransportError(exError)) || (!newEx && op && typeof navigator !== 'undefined' && navigator.onLine)) {
      if (op) removeOfflineOp(op.id, owner);
      console.error('restoreExercise failed:', exError?.message);
      return false;
    }
    const online = !!newEx && !exError;
    if (op && online) removeOfflineOp(op.id, owner);
    const exerciseId = online ? (newEx as WorkoutExercise).id : offlineTempId((op as { id: string }).id);

    let restoredSets: WorkoutSet[] = [];
    let setsRestored = true;
    if (sets.length > 0 && online) {
      const { data: setsData, error: setsError } = await supabase
        .from('workout_sets')
        .insert(sets.map(s => ({ ...s, exercise_id: exerciseId })))
        .select();
      if (setsError) console.error('restoreExercise sets failed:', setsError.message);
      restoredSets = (setsData ?? []) as WorkoutSet[];
      setsRestored = !setsError;
    } else if (sets.length > 0) {
      restoredSets = sets.map((s, i) => ({ ...s, id: `${exerciseId}:set:${i}`, exercise_id: exerciseId } as WorkoutSet));
    }

    const restoredExercise = {
      ...row, id: exerciseId, sets: restoredSets,
    } as WorkoutExercise;
    set(s => {
      if (!s.currentWorkout) return s;
      const updated = {
        ...s.currentWorkout,
        exercises: [...(s.currentWorkout.exercises ?? []), restoredExercise]
          .sort((a, b) => a.order_index - b.order_index),
      };
      setCacheItem(workoutCacheKey(workoutId), updated);
      return { currentWorkout: updated, ...queueCounts(owner) };
    });
    return setsRestored;
  },

  setCurrentWorkout: (w) => set({ currentWorkout: w }),

  linkSuperset: async (exerciseIds) => {
    // groupId déterministe pour l'op : le rejeu produit le même groupe.
    const groupId = crypto.randomUUID().slice(0, 8);
    await guardedMutation(
      'superset.link',
      { exerciseIds: [...exerciseIds], groupId },
      () => {
        set(s => {
          if (!s.currentWorkout) return s;
          const updated = {
            ...s.currentWorkout,
            exercises: s.currentWorkout.exercises?.map(e =>
              exerciseIds.includes(e.id) ? { ...e, superset_group_id: groupId } : e
            ),
          };
          setCacheItem(workoutCacheKey(s.currentWorkout.id), updated);
          return { currentWorkout: updated };
        });
      },
      async () => {
        const { error } = await supabase
          .from('workout_exercises')
          .update({ superset_group_id: groupId })
          .in('id', exerciseIds);
        return { error };
      },
    );
  },

  unlinkSuperset: async (exerciseId) => {
    const unlinkLocal = () => {
      set(s => {
        if (!s.currentWorkout) return s;
        const exercise = s.currentWorkout.exercises?.find(e => e.id === exerciseId);
        const groupId = exercise?.superset_group_id;
        let exercises = s.currentWorkout.exercises?.map(e =>
          e.id === exerciseId ? { ...e, superset_group_id: null } : e
        );
        if (groupId && exercises) {
          const remaining = exercises.filter(e => e.superset_group_id === groupId);
          if (remaining.length === 1) {
            exercises = exercises.map(e =>
              e.superset_group_id === groupId ? { ...e, superset_group_id: null } : e
            );
          }
        }
        const updated = { ...s.currentWorkout, exercises };
        setCacheItem(workoutCacheKey(s.currentWorkout.id), updated);
        return { currentWorkout: updated };
      });
    };
    await guardedMutation(
      'superset.unlink',
      { exerciseId },
      unlinkLocal,
      async () => {
        const { error } = await supabase
          .from('workout_exercises')
          .update({ superset_group_id: null })
          .eq('id', exerciseId);
        return { error };
      },
    );
  },

  fetchPreviousSets: async (userId, exerciseName, currentWorkoutId, catalogExerciseId) => {
    const base = supabase
      .from('workout_exercises')
      .select('id, workout_id, workouts!inner(user_id, date)')
      .eq('workouts.user_id', userId)
      .neq('workout_id', currentWorkoutId);
    // A catalog exercise is matched by its catalog id, so accents or case in the
    // logged name never split its history (« Developpe couche » / « Développé couché »).
    const { data: exercises } = await (catalogExerciseId
      ? base.eq('catalog_exercise_id', catalogExerciseId)
      : base.ilike('name', exerciseName));

    if (!exercises || exercises.length === 0) return [];

    // Sort by date desc, pick most recent session
    const sorted = [...exercises].sort((a, b) => {
      const aDate = (a.workouts as unknown as { date: string }).date;
      const bDate = (b.workouts as unknown as { date: string }).date;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
    const mostRecent = sorted[0];

    const { data: sets } = await supabase
      .from('workout_sets')
      .select('weight_kg, reps, rir, set_type, order_index')
      .eq('exercise_id', mostRecent.id)
      .order('order_index');

    return (sets ?? []) as PreviousSet[];
  },

  fetchExerciseHistory: async (userId, exerciseName, currentWorkoutId, limit = 5, catalogExerciseId) => {
    const base = supabase
      .from('workout_exercises')
      .select('id, workout_id, workouts!inner(user_id, date)')
      .eq('workouts.user_id', userId)
      .neq('workout_id', currentWorkoutId);
    // A catalog exercise is matched by its catalog id, so accents or case in the
    // logged name never split its history (« Developpe couche » / « Développé couché »).
    const { data: exercises } = await (catalogExerciseId
      ? base.eq('catalog_exercise_id', catalogExerciseId)
      : base.ilike('name', exerciseName));

    if (!exercises || exercises.length === 0) return [];

    const sorted = [...exercises].sort((a, b) => {
      const aDate = (a.workouts as unknown as { date: string }).date;
      const bDate = (b.workouts as unknown as { date: string }).date;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

    const recent = sorted.slice(0, limit);
    const results: ExerciseSession[] = [];

    for (const ex of recent) {
      const { data: sets } = await supabase
        .from('workout_sets')
        .select('weight_kg, reps, rir, set_type, order_index')
        .eq('exercise_id', ex.id)
        .order('order_index');

      results.push({
        date: (ex.workouts as unknown as { date: string }).date,
        sets: (sets ?? []) as PreviousSet[],
      });
    }

    return results;
  },

  reset: () => {
    workoutGeneration.next();
    set({ workouts: [], currentWorkout: null, loading: false, pendingOps: 0, deadOps: 0, queueBlocked: null, workoutsExhausted: false });
  },
}));
