import { create } from 'zustand';
import { supabase } from '../lib/supabase';
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
}

export const useRoutineStore = create<RoutineState>((set) => ({
  routines: [],
  loading: false,

  fetchRoutines: async (userId) => {
    set({ loading: true });
    const { data } = await supabase
      .from('routines')
      .select('*, routine_exercises(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    set({
      routines: (data ?? []).map(row => {
        const routine = row as Routine & { routine_exercises?: RoutineExercise[] };
        routine.exercises = (routine.routine_exercises ?? []).sort((a, b) => a.order_index - b.order_index);
        return routine;
      }),
      loading: false,
    });
  },

  fetchRoutineWithExercises: async (routineId) => {
    const { data } = await supabase
      .from('routines')
      .select('*, routine_exercises(*)')
      .eq('id', routineId)
      .maybeSingle();
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
}));
