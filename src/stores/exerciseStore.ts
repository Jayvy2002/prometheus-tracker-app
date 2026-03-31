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
  pollRequest: (requestId: string) => Promise<ExerciseRequest | null>;
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
    if (!data) return null;

    const request = data as ExerciseRequest;

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-exercise`;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (token) {
      fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ request_id: request.id }),
      }).catch(() => {});
    }

    return request;
  },

  pollRequest: async (requestId) => {
    const { data } = await supabase
      .from('exercise_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (!data) return null;
    const req = data as ExerciseRequest;

    if (req.status === 'approved' && req.result_exercise_id) {
      const { data: exercise } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', req.result_exercise_id)
        .maybeSingle();

      if (exercise) {
        set(s => {
          const exists = s.exercises.some(e => e.id === exercise.id);
          if (exists) return s;
          return { exercises: [...s.exercises, exercise as Exercise].sort((a, b) => a.name.localeCompare(b.name)) };
        });
      }
    }

    return req;
  },
}));
