import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { getCacheItem, setCacheItem } from '../lib/offlineCache';
import { isTransportError } from '../lib/offlineQueue';
import type { Routine, RoutineExercise } from '../lib/types';

interface RoutineState {
  routines: Routine[];
  loading: boolean;
  fetchRoutines: (userId: string) => Promise<void>;
  fetchRoutineWithExercises: (routineId: string) => Promise<Routine | null>;
  createRoutine: (routine: Partial<Routine>) => Promise<string | null>;
  updateRoutine: (id: string, data: Partial<Routine>) => Promise<void>;
  deleteRoutine: (id: string) => Promise<void>;
  addRoutineExercise: (routineId: string, exercise: Partial<RoutineExercise>) => Promise<RoutineExercise | null>;
  updateRoutineExercise: (id: string, data: Partial<RoutineExercise>) => Promise<void>;
  deleteRoutineExercise: (id: string) => Promise<void>;
  reset: () => void;
}

export const useRoutineStore = create<RoutineState>((set, get) => ({
  routines: [],
  loading: false,

  fetchRoutines: async (userId) => {
    set({ loading: true });
    // Vision §26: routines already synced stay usable offline.
    const cacheKey = `routines:${userId}`;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const { data, error } = offline
      ? { data: null, error: { message: 'offline' } }
      : await supabase
        .from('routines')
        .select('*, routine_exercises(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    if (error && (offline || isTransportError(error))) {
      set({ routines: getCacheItem<Routine[]>(cacheKey) ?? [], loading: false });
      return;
    }
    const routines = (data ?? []).map(row => {
      const routine = row as Routine & { routine_exercises?: RoutineExercise[] };
      routine.exercises = (routine.routine_exercises ?? []).sort((a, b) => a.order_index - b.order_index);
      return routine;
    });
    if (!error) setCacheItem(cacheKey, routines);
    set({ routines, loading: false });
  },

  fetchRoutineWithExercises: async (routineId) => {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const { data, error } = offline
      ? { data: null, error: { message: 'offline' } }
      : await supabase
        .from('routines')
        .select('*, routine_exercises(*)')
        .eq('id', routineId)
        .maybeSingle();
    if (error && (offline || isTransportError(error))) {
      // Offline: the list already loaded (or cached) carries its exercises.
      return get().routines.find(r => r.id === routineId) ?? null;
    }
    if (data) {
      const routine = data as Routine;
      routine.exercises = (data as unknown as { routine_exercises: RoutineExercise[] }).routine_exercises
        ?.sort((a, b) => a.order_index - b.order_index) ?? [];
      return routine;
    }
    return null;
  },

  createRoutine: async (routine) => {
    const { data } = await supabase
      .from('routines')
      .insert(routine)
      .select()
      .maybeSingle();
    if (data) {
      set(s => ({ routines: [{ ...data, exercises: [] } as Routine, ...s.routines] }));
      return data.id;
    }
    return null;
  },

  updateRoutine: async (id, updates) => {
    await supabase
      .from('routines')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    set(s => ({
      routines: s.routines.map(r => r.id === id ? { ...r, ...updates } : r),
    }));
  },

  deleteRoutine: async (id) => {
    await supabase.from('routines').delete().eq('id', id);
    set(s => ({ routines: s.routines.filter(r => r.id !== id) }));
  },

  addRoutineExercise: async (routineId, exercise) => {
    const { data } = await supabase
      .from('routine_exercises')
      .insert({ ...exercise, routine_id: routineId })
      .select()
      .maybeSingle();
    return data as RoutineExercise | null;
  },

  updateRoutineExercise: async (id, updates) => {
    await supabase.from('routine_exercises').update(updates).eq('id', id);
  },

  deleteRoutineExercise: async (id) => {
    await supabase.from('routine_exercises').delete().eq('id', id);
  },

  reset: () => set({ routines: [], loading: false }),
}));
