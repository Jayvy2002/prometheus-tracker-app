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
  reset: () => void;
}

let fetchGeneration = 0;

const CATALOG_COLUMNS = 'id, name, name_fr, primary_muscles, secondary_muscles, category, equipment, verified, created_by, merged_into_id, instructions, tips, difficulty, video_url';
// A frontend deployed before the measurement migration still loads the catalog.
const UNDEFINED_COLUMN = '42703';

export const useExerciseStore = create<ExerciseState>((set, get) => ({
  exercises: [],
  loading: false,
  fetched: false,
  loadError: false,

  fetchExercises: async () => {
    if (get().fetched) return;
    const generation = ++fetchGeneration;
    set({ loading: true, loadError: false });
    const pageSize = 500;
    const rows: Exercise[] = [];
    let columns = `${CATALOG_COLUMNS}, measurement`;
    for (let from = 0; from < 5000; from += pageSize) {
      let { data, error } = await supabase
        .from('exercises')
        .select(columns)
        .order('name')
        .range(from, from + pageSize - 1);
      if (generation !== fetchGeneration) return;
      if (error?.code === UNDEFINED_COLUMN && columns !== CATALOG_COLUMNS) {
        columns = CATALOG_COLUMNS;
        ({ data, error } = await supabase
          .from('exercises')
          .select(columns)
          .order('name')
          .range(from, from + pageSize - 1));
        if (generation !== fetchGeneration) return;
      }
      if (error) {
        set({ loading: false, fetched: false, loadError: true, exercises: [] });
        return;
      }
      const page = ((data ?? []) as unknown as Exercise[]).filter(ex => !ex.merged_into_id);
      rows.push(...page);
      if ((data ?? []).length < pageSize) break;
    }
    const aliasRes = await supabase.from('exercise_aliases').select('exercise_id, alias');
    if (generation !== fetchGeneration) return;
    if (aliasRes.error) {
      set({ loading: false, fetched: false, loadError: true, exercises: [] });
      return;
    }
    const byId = new Map<string, string[]>();
    for (const row of (aliasRes.data ?? []) as { exercise_id: string; alias: string }[]) {
      const list = byId.get(row.exercise_id) ?? [];
      list.push(row.alias);
      byId.set(row.exercise_id, list);
    }
    for (const ex of rows) ex.aliases = byId.get(ex.id) ?? [];
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

  reset: () => {
    fetchGeneration += 1;
    set({ exercises: [], loading: false, fetched: false, loadError: false });
  },
}));
