import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { rankExercises } from '../lib/pickerSearch';
import type { Exercise, ExerciseRequest } from '../lib/types';

interface ExerciseState {
  exercises: Exercise[];
  loading: boolean;
  fetched: boolean;
  loadError: boolean;
  fetchExercises: () => Promise<void>;
  searchExercises: (query: string, lang?: string) => Exercise[];
  submitExercise: (userId: string, name: string, muscles: string, description: string) => Promise<ExerciseRequest | null>;
  addExercise: (exercise: Exercise) => void;
}

export const useExerciseStore = create<ExerciseState>((set, get) => ({
  exercises: [],
  loading: false,
  fetched: false,
  loadError: false,

  fetchExercises: async () => {
    if (get().fetched) return;
    set({ loading: true, loadError: false });
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .order('name');
    if (error) {
      set({ loading: false, fetched: false, loadError: true });
      return;
    }
    const rows = ((data ?? []) as Exercise[]).filter(ex => !ex.merged_into_id);
    const aliasRes = await supabase.from('exercise_aliases').select('exercise_id, alias');
    if (!aliasRes.error && aliasRes.data) {
      const byId = new Map<string, string[]>();
      for (const row of aliasRes.data as { exercise_id: string; alias: string }[]) {
        const list = byId.get(row.exercise_id) ?? [];
        list.push(row.alias);
        byId.set(row.exercise_id, list);
      }
      for (const ex of rows) ex.aliases = byId.get(ex.id) ?? [];
    }
    set({ exercises: rows, loading: false, fetched: true, loadError: false });
  },

  searchExercises: (query, lang = 'fr') => rankExercises(get().exercises, query, lang),

  submitExercise: async (userId, name, muscles, description) => {
    const { data } = await supabase
      .from('exercise_requests')
      .insert({ user_id: userId, name, muscles, description })
      .select()
      .maybeSingle();
    return data ? (data as ExerciseRequest) : null;
  },

  addExercise: (exercise: Exercise) => {
    set(state => ({
      exercises: [...state.exercises, exercise].sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },
}));
