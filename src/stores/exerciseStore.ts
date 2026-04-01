import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Exercise, ExerciseRequest } from '../lib/types';

interface ExerciseState {
  exercises: Exercise[];
  loading: boolean;
  fetched: boolean;
  fetchExercises: () => Promise<void>;
  searchExercises: (query: string) => Exercise[];
  submitExercise: (userId: string, name: string, muscles: string, description: string) => Promise<ExerciseRequest | null>;
}

export const useExerciseStore = create<ExerciseState>((set, get) => ({
  exercises: [],
  loading: false,
  fetched: false,

  fetchExercises: async () => {
    if (get().fetched) return;
    set({ loading: true });
    const { data } = await supabase
      .from('exercises')
      .select('*')
      .order('name');
    set({ exercises: (data ?? []) as Exercise[], loading: false, fetched: true });
  },

  searchExercises: (query: string) => {
    const q = query.toLowerCase().trim();
    if (!q) return get().exercises;
    return get().exercises.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.name_fr.toLowerCase().includes(q) ||
      e.primary_muscles.some(m => m.toLowerCase().includes(q)) ||
      e.equipment.toLowerCase().includes(q)
    );
  },

  submitExercise: async (userId, name, muscles, description) => {
    const { data } = await supabase
      .from('exercise_requests')
      .insert({ user_id: userId, name, muscles, description })
      .select()
      .maybeSingle();
    return data ? (data as ExerciseRequest) : null;
  },
}));
