import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { rankExercises } from '../lib/pickerSearch';
import type { Exercise, ExerciseRequest } from '../lib/types';

interface ExerciseState {
  exercises: Exercise[];
  loading: boolean;
  fetched: boolean;
  fetchExercises: () => Promise<void>;
  searchExercises: (query: string, lang?: string) => Exercise[];
  submitExercise: (userId: string, name: string, muscles: string, description: string) => Promise<ExerciseRequest | null>;
  addExercise: (exercise: Exercise) => void;
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
