import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Workout, WorkoutExercise, WorkoutSet } from '../lib/types';
import { setCacheItem, getCacheItem, clearCacheItem, workoutCacheKey } from '../lib/offlineCache';

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
  setCurrentWorkout: (w: Workout | null) => void;
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
      .order('date', { ascending: false });
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
    await supabase
      .from('workouts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    const current = get().currentWorkout;
    if (current?.id === id) {
      const updated = { ...current, ...updates };
      set({ currentWorkout: updated });
      setCacheItem(workoutCacheKey(id), updated);
    }
    set(s => ({
      workouts: s.workouts.map(w => w.id === id ? { ...w, ...updates } : w),
    }));
  },

  deleteWorkout: async (id) => {
    await supabase.from('workouts').delete().eq('id', id);
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
    await supabase.from('workout_exercises').update(updates).eq('id', id);
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
    await supabase.from('workout_exercises').delete().eq('id', id);
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
    await supabase.from('workout_sets').update(updates).eq('id', id);
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
    await supabase.from('workout_sets').delete().eq('id', id);
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

  setCurrentWorkout: (w) => set({ currentWorkout: w }),
}));
