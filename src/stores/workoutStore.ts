import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Workout, WorkoutExercise, WorkoutSet } from '../lib/types';
import { setCacheItem, getCacheItem, clearCacheItem, workoutCacheKey } from '../lib/offlineCache';
import { parseDate, toLocalDateStr } from '../lib/utils';
import { useStreakStore } from './streakStore';

interface PreviousSet {
  weight_kg: number;
  reps: number;
  rir: number;
  set_type: string;
  order_index: number;
}

export interface ExerciseSession {
  date: string;
  sets: PreviousSet[];
}

interface WorkoutState {
  workouts: Workout[];
  currentWorkout: Workout | null;
  loading: boolean;
  fetchWorkouts: (userId: string) => Promise<void>;
  fetchWorkout: (workoutId: string) => Promise<void>;
  createWorkout: (workout: Partial<Workout>) => Promise<string | null>;
  updateWorkout: (id: string, data: Partial<Workout>) => Promise<void>;
  deleteWorkout: (id: string) => Promise<void>;
  addExercise: (workoutId: string, name: string, orderIndex: number) => Promise<WorkoutExercise | null>;
  updateExercise: (id: string, data: Partial<WorkoutExercise>) => Promise<void>;
  deleteExercise: (id: string) => Promise<void>;
  addSet: (exerciseId: string, orderIndex: number) => Promise<WorkoutSet | null>;
  updateSet: (id: string, data: Partial<WorkoutSet>) => Promise<void>;
  deleteSet: (id: string) => Promise<void>;
  restoreSet: (exerciseId: string, setData: WorkoutSet) => Promise<void>;
  restoreExercise: (workoutId: string, exerciseData: WorkoutExercise) => Promise<void>;
  setCurrentWorkout: (w: Workout | null) => void;
  linkSuperset: (exerciseIds: string[]) => Promise<void>;
  unlinkSuperset: (exerciseId: string) => Promise<void>;
  fetchPreviousSets: (userId: string, exerciseName: string, currentWorkoutId: string) => Promise<PreviousSet[]>;
  fetchExerciseHistory: (userId: string, exerciseName: string, currentWorkoutId: string, limit?: number) => Promise<ExerciseSession[]>;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  workouts: [],
  currentWorkout: null,
  loading: false,

  fetchWorkouts: async (userId) => {
    set({ loading: true });
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(500);
    set({ workouts: (data ?? []) as Workout[], loading: false });
  },

  fetchWorkout: async (workoutId) => {
    const cached = getCacheItem<Workout>(workoutCacheKey(workoutId));
    if (cached) {
      set({ currentWorkout: cached });
    }

    const { data: workout } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', workoutId)
      .maybeSingle();
    if (!workout) return;

    const { data: exercises } = await supabase
      .from('workout_exercises')
      .select('*')
      .eq('workout_id', workoutId)
      .order('order_index');

    const exIds = (exercises ?? []).map(e => e.id);
    let sets: WorkoutSet[] = [];
    if (exIds.length > 0) {
      const { data: setsData } = await supabase
        .from('workout_sets')
        .select('*')
        .in('exercise_id', exIds)
        .order('order_index');
      sets = (setsData ?? []) as WorkoutSet[];
    }

    const fullExercises = (exercises ?? []).map(ex => ({
      ...ex,
      sets: sets.filter(s => s.exercise_id === ex.id),
    })) as WorkoutExercise[];

    const fullWorkout = { ...workout, exercises: fullExercises } as Workout;
    set({ currentWorkout: fullWorkout });
    setCacheItem(workoutCacheKey(workoutId), fullWorkout);
  },

  createWorkout: async (workout) => {
    const { data, error } = await supabase
      .from('workouts')
      .insert(workout)
      .select()
      .maybeSingle();
    if (error) {
      console.error('createWorkout error:', error.message);
      return null;
    }
    if (data) {
      const w = { ...data, exercises: [] } as Workout;
      set(s => ({ workouts: [w, ...s.workouts], currentWorkout: w }));
      return data.id;
    }
    return null;
  },

  updateWorkout: async (id, updates) => {
    const { error } = await supabase
      .from('workouts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { console.error('updateWorkout failed:', error.message); return; }
    const current = get().currentWorkout;
    if (current?.id === id) {
      const updated = { ...current, ...updates };
      set({ currentWorkout: updated });
      setCacheItem(workoutCacheKey(id), updated);
    }
    set(s => ({
      workouts: s.workouts.map(w => w.id === id ? { ...w, ...updates } : w),
    }));
    if (updates.completed) {
      const workout = get().currentWorkout?.id === id
        ? { ...get().currentWorkout, ...updates }
        : get().workouts.find(w => w.id === id);
      if (workout?.user_id && workout.date) {
        void useStreakStore.getState().recordActivity(
          workout.user_id,
          toLocalDateStr(parseDate(workout.date)),
        );
      }
    }
  },

  deleteWorkout: async (id) => {
    const { error } = await supabase.from('workouts').delete().eq('id', id);
    if (error) { console.error('deleteWorkout failed:', error.message); return; }
    clearCacheItem(workoutCacheKey(id));
    set(s => ({
      workouts: s.workouts.filter(w => w.id !== id),
      currentWorkout: s.currentWorkout?.id === id ? null : s.currentWorkout,
    }));
  },

  addExercise: async (workoutId, name, orderIndex) => {
    const { data } = await supabase
      .from('workout_exercises')
      .insert({ workout_id: workoutId, name, order_index: orderIndex })
      .select()
      .maybeSingle();
    if (data) {
      const ex = { ...data, sets: [] } as WorkoutExercise;
      set(s => {
        if (!s.currentWorkout) return s;
        const updated = {
          ...s.currentWorkout,
          exercises: [...(s.currentWorkout.exercises ?? []), ex],
        };
        setCacheItem(workoutCacheKey(workoutId), updated);
        return { currentWorkout: updated };
      });
      return ex;
    }
    return null;
  },

  updateExercise: async (id, updates) => {
    const { error } = await supabase.from('workout_exercises').update(updates).eq('id', id);
    if (error) { console.error('updateExercise failed:', error.message); return; }
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

  deleteExercise: async (id) => {
    const { error } = await supabase.from('workout_exercises').delete().eq('id', id);
    if (error) { console.error('deleteExercise failed:', error.message); return; }
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

  addSet: async (exerciseId, orderIndex) => {
    const { data } = await supabase
      .from('workout_sets')
      .insert({ exercise_id: exerciseId, order_index: orderIndex })
      .select()
      .maybeSingle();
    if (data) {
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
        return { currentWorkout: updated };
      });
      return newSet;
    }
    return null;
  },

  updateSet: async (id, updates) => {
    const { error } = await supabase.from('workout_sets').update(updates).eq('id', id);
    if (error) { console.error('updateSet failed:', error.message); return; }
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

  deleteSet: async (id) => {
    const { error } = await supabase.from('workout_sets').delete().eq('id', id);
    if (error) { console.error('deleteSet failed:', error.message); return; }
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

  restoreSet: async (exerciseId, setData) => {
    const { data } = await supabase
      .from('workout_sets')
      .insert({
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
      })
      .select()
      .maybeSingle();
    if (data) {
      const restoredSet = data as WorkoutSet;
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
        return { currentWorkout: updated };
      });
    }
  },

  restoreExercise: async (workoutId, exerciseData) => {
    const { data: newEx, error: exError } = await supabase
      .from('workout_exercises')
      .insert({
        workout_id: workoutId,
        name: exerciseData.name,
        order_index: exerciseData.order_index,
        notes: exerciseData.notes,
        superset_group_id: exerciseData.superset_group_id,
      })
      .select()
      .maybeSingle();
    if (exError || !newEx) {
      console.error('restoreExercise failed:', exError?.message);
      return;
    }

    const setsToInsert = (exerciseData.sets ?? []).map(s => ({
      exercise_id: newEx.id,
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
    }));

    let restoredSets: WorkoutSet[] = [];
    if (setsToInsert.length > 0) {
      const { data: setsData, error: setsError } = await supabase
        .from('workout_sets')
        .insert(setsToInsert)
        .select();
      if (setsError) console.error('restoreExercise sets failed:', setsError.message);
      restoredSets = (setsData ?? []) as WorkoutSet[];
    }

    const restoredExercise = { ...newEx, sets: restoredSets } as WorkoutExercise;
    set(s => {
      if (!s.currentWorkout) return s;
      const updated = {
        ...s.currentWorkout,
        exercises: [...(s.currentWorkout.exercises ?? []), restoredExercise]
          .sort((a, b) => a.order_index - b.order_index),
      };
      setCacheItem(workoutCacheKey(workoutId), updated);
      return { currentWorkout: updated };
    });
  },

  setCurrentWorkout: (w) => set({ currentWorkout: w }),

  linkSuperset: async (exerciseIds) => {
    const groupId = crypto.randomUUID().slice(0, 8);
    const { error } = await supabase
      .from('workout_exercises')
      .update({ superset_group_id: groupId })
      .in('id', exerciseIds);
    if (error) { console.error('linkSuperset failed:', error.message); return; }
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

  unlinkSuperset: async (exerciseId) => {
    const { error } = await supabase
      .from('workout_exercises')
      .update({ superset_group_id: null })
      .eq('id', exerciseId);
    if (error) { console.error('unlinkSuperset failed:', error.message); return; }
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
  },

  fetchPreviousSets: async (userId, exerciseName, currentWorkoutId) => {
    const { data: exercises } = await supabase
      .from('workout_exercises')
      .select('id, workout_id, workouts!inner(user_id, date)')
      .eq('workouts.user_id', userId)
      .ilike('name', exerciseName)
      .neq('workout_id', currentWorkoutId);

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

  fetchExerciseHistory: async (userId, exerciseName, currentWorkoutId, limit = 5) => {
    const { data: exercises } = await supabase
      .from('workout_exercises')
      .select('id, workout_id, workouts!inner(user_id, date)')
      .eq('workouts.user_id', userId)
      .ilike('name', exerciseName)
      .neq('workout_id', currentWorkoutId);

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
}));
