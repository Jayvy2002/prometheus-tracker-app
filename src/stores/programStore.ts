import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type {
  Program,
  ProgramAssignment,
  ProgramDay,
  ProgramDayExercise,
  Routine,
} from '../lib/types';

interface ProgramState {
  programs: Program[];
  assignment: ProgramAssignment | null;
  loading: boolean;
  fetchPrograms: (ownerId: string) => Promise<void>;
  fetchProgram: (programId: string) => Promise<Program | null>;
  createProgram: (program: Partial<Program>, days: Omit<ProgramDay, 'id' | 'program_id' | 'created_at'>[]) => Promise<string | null>;
  updateProgram: (id: string, data: Partial<Program>) => Promise<{ error: string | null }>;
  deleteProgram: (id: string) => Promise<void>;
  setProgramDayFromRoutine: (dayId: string, routine: Routine) => Promise<void>;
  setProgramDayExercises: (
    dayId: string,
    exercises: Array<{
      name: string;
      default_sets: number;
      default_reps: number;
      default_reps_min?: number | null;
      default_rir?: number | null;
      default_rest_seconds?: number;
      default_weight_kg?: number | null;
      order_index: number;
    }>,
  ) => Promise<void>;
  applyExercisePatch: (
    programId: string,
    patch: {
      exercise: string;
      weekday?: number | null;
      default_sets?: number;
      default_reps?: number;
      default_reps_min?: number | null;
      default_rir?: number | null;
      default_rest_seconds?: number;
      default_weight_kg?: number | null;
      replace_with?: string;
    },
  ) => Promise<{ error: string | null }>;
  syncProgramDays: (
    programId: string,
    days: Array<{
      weekday: number;
      name: string;
      exercises: Array<{
        name: string;
        default_sets: number;
        default_reps: number;
        default_reps_min?: number | null;
        default_rir?: number | null;
        default_rest_seconds?: number;
        default_weight_kg?: number | null;
      }>;
    }>,
  ) => Promise<{ error: string | null }>;
  fetchMyAssignment: (clientId: string) => Promise<void>;
  assignProgram: (programId: string, clientId: string, startDate: string) => Promise<{ error: string | null }>;
  pauseAssignment: (id: string) => Promise<void>;
  clear: () => void;
}

async function loadDays(programId: string): Promise<ProgramDay[]> {
  const { data: days } = await supabase
    .from('program_days')
    .select('*')
    .eq('program_id', programId)
    .order('weekday');
  if (!days?.length) return [];
  const ids = days.map(d => d.id);
  let exercises: ProgramDayExercise[] = [];
  try {
    const { data } = await supabase
      .from('program_day_exercises')
      .select('*')
      .in('program_day_id', ids)
      .order('order_index');
    exercises = (data ?? []) as ProgramDayExercise[];
  } catch {
    exercises = [];
  }
  const byDay = new Map<string, ProgramDayExercise[]>();
  for (const ex of exercises) {
    const list = byDay.get(ex.program_day_id) ?? [];
    list.push(ex);
    byDay.set(ex.program_day_id, list);
  }
  return (days as ProgramDay[]).map(d => ({
    ...d,
    exercises: byDay.get(d.id) ?? [],
  }));
}

export const useProgramStore = create<ProgramState>((set, get) => ({
  programs: [],
  assignment: null,
  loading: false,

  fetchPrograms: async (ownerId) => {
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('programs')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as Program[];
      const withDays = await Promise.all(list.map(async p => {
        try {
          return { ...p, days: await loadDays(p.id) };
        } catch {
          return { ...p, days: [] as ProgramDay[] };
        }
      }));
      set({ programs: withDays });
    } catch {
      set({ programs: [] });
    } finally {
      set({ loading: false });
    }
  },

  fetchProgram: async (programId) => {
    try {
      const { data, error } = await supabase.from('programs').select('*').eq('id', programId).maybeSingle();
      if (error || !data) return null;
      let days: ProgramDay[] = [];
      try {
        days = await loadDays(programId);
      } catch {
        days = [];
      }
      const program = { ...(data as Program), days };
      set(s => ({
        programs: s.programs.some(p => p.id === programId)
          ? s.programs.map(p => p.id === programId ? program : p)
          : [program, ...s.programs],
      }));
      return program;
    } catch {
      return null;
    }
  },

  createProgram: async (program, days) => {
    const { data, error } = await supabase
      .from('programs')
      .insert(program)
      .select()
      .maybeSingle();
    if (error || !data) {
      console.error('createProgram failed:', error?.message);
      return null;
    }
    const createdDays: ProgramDay[] = [];
    for (const day of days) {
      const { data: d } = await supabase
        .from('program_days')
        .insert({
          program_id: data.id,
          weekday: day.weekday,
          name: day.name,
          routine_id: day.routine_id,
          order_index: day.order_index,
        })
        .select()
        .maybeSingle();
      if (d) createdDays.push({ ...(d as ProgramDay), exercises: [] });
    }
    const full = { ...data, days: createdDays } as Program;
    set(s => ({ programs: [full, ...s.programs] }));
    return data.id as string;
  },

  updateProgram: async (id, updates) => {
    const { error } = await supabase.from('programs').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return { error: error.message };
    set(s => ({
      programs: s.programs.map(p => p.id === id ? { ...p, ...updates } : p),
    }));
    return { error: null };
  },

  deleteProgram: async (id) => {
    await supabase.from('programs').delete().eq('id', id);
    set(s => ({ programs: s.programs.filter(p => p.id !== id) }));
  },

  setProgramDayFromRoutine: async (dayId, routine) => {
    await supabase.from('program_day_exercises').delete().eq('program_day_id', dayId);
    const exercises = routine.exercises ?? [];
    if (exercises.length > 0) {
      await supabase.from('program_day_exercises').insert(
        exercises.map(ex => ({
          program_day_id: dayId,
          name: ex.name,
          default_sets: ex.default_sets,
          default_reps: ex.default_reps,
          default_rest_seconds: ex.default_rest_seconds,
          order_index: ex.order_index,
        })),
      );
    }
    await supabase.from('program_days').update({
      name: routine.name,
      routine_id: routine.id,
    }).eq('id', dayId);
    const programId = get().programs.find(p => p.days?.some(d => d.id === dayId))?.id;
    if (programId) await get().fetchProgram(programId);
  },

  setProgramDayExercises: async (dayId, exercises) => {
    await supabase.from('program_day_exercises').delete().eq('program_day_id', dayId);
    if (exercises.length > 0) {
      const rich = exercises.map(ex => ({
        program_day_id: dayId,
        name: ex.name,
        default_sets: ex.default_sets,
        default_reps: ex.default_reps,
        default_reps_min: ex.default_reps_min ?? null,
        default_rir: ex.default_rir ?? null,
        default_rest_seconds: ex.default_rest_seconds ?? 90,
        default_weight_kg: ex.default_weight_kg ?? null,
        order_index: ex.order_index,
      }));
      const { error } = await supabase.from('program_day_exercises').insert(rich);
      if (error) {
        await supabase.from('program_day_exercises').insert(
          exercises.map(ex => ({
            program_day_id: dayId,
            name: ex.name,
            default_sets: ex.default_sets,
            default_reps: ex.default_reps,
            default_rest_seconds: ex.default_rest_seconds ?? 90,
            order_index: ex.order_index,
          })),
        );
      }
    }
    const programId = get().programs.find(p => p.days?.some(d => d.id === dayId))?.id;
    if (programId) await get().fetchProgram(programId);
  },

  applyExercisePatch: async (programId, patch) => {
    const program = await get().fetchProgram(programId);
    if (!program) return { error: 'Program not found' };
    const days = program.days ?? [];
    const targetDays = patch.weekday == null ? days : days.filter(d => d.weekday === patch.weekday);
    let applied = false;
    for (const day of targetDays) {
      const exercises = [...(day.exercises ?? [])];
      const idx = exercises.findIndex(ex => ex.name.toLowerCase() === patch.exercise.toLowerCase()
        || ex.name.toLowerCase().includes(patch.exercise.toLowerCase())
        || patch.exercise.toLowerCase().includes(ex.name.toLowerCase()));
      if (idx < 0) continue;
      const current = exercises[idx];
      exercises[idx] = {
        ...current,
        name: patch.replace_with?.trim() || current.name,
        default_sets: patch.default_sets ?? current.default_sets,
        default_reps: patch.default_reps ?? current.default_reps,
        default_reps_min: patch.default_reps_min === undefined ? current.default_reps_min : patch.default_reps_min,
        default_rir: patch.default_rir === undefined ? current.default_rir : patch.default_rir,
        default_rest_seconds: patch.default_rest_seconds ?? current.default_rest_seconds,
        default_weight_kg: patch.default_weight_kg === undefined ? current.default_weight_kg : patch.default_weight_kg,
      };
      await get().setProgramDayExercises(day.id, exercises.map((ex, order_index) => ({
        name: ex.name,
        default_sets: ex.default_sets,
        default_reps: ex.default_reps,
        default_reps_min: ex.default_reps_min,
        default_rir: ex.default_rir,
        default_rest_seconds: ex.default_rest_seconds,
        default_weight_kg: ex.default_weight_kg,
        order_index,
      })));
      applied = true;
      if (patch.weekday != null) break;
    }
    return applied ? { error: null } : { error: 'Exercise not found in program' };
  },

  syncProgramDays: async (programId, days) => {
    const program = await get().fetchProgram(programId);
    if (!program) return { error: 'Program not found' };
    const existing = [...(program.days ?? [])];
    const usedIds = new Set<string>();
    for (let i = 0; i < days.length; i++) {
      const draft = days[i];
      let row = existing.find(d => d.weekday === draft.weekday && !usedIds.has(d.id));
      if (!row) {
        const { data, error } = await supabase.from('program_days').insert({
          program_id: programId,
          weekday: draft.weekday,
          name: draft.name,
          routine_id: null,
          order_index: i,
        }).select().maybeSingle();
        if (error || !data) return { error: error?.message ?? 'Failed to create program day' };
        row = { ...(data as ProgramDay), exercises: [] };
      } else {
        const { error } = await supabase.from('program_days').update({
          name: draft.name,
          weekday: draft.weekday,
          order_index: i,
        }).eq('id', row.id);
        if (error) return { error: error.message };
      }
      usedIds.add(row.id);
      await get().setProgramDayExercises(row.id, draft.exercises.map((ex, order_index) => ({
        name: ex.name,
        default_sets: ex.default_sets,
        default_reps: ex.default_reps,
        default_reps_min: ex.default_reps_min,
        default_rir: ex.default_rir,
        default_rest_seconds: ex.default_rest_seconds,
        default_weight_kg: ex.default_weight_kg,
        order_index,
      })));
    }
    for (const extra of existing.filter(d => !usedIds.has(d.id))) {
      await supabase.from('program_days').delete().eq('id', extra.id);
    }
    await get().fetchProgram(programId);
    return { error: null };
  },

  fetchMyAssignment: async (clientId) => {
    const { data } = await supabase
      .from('program_assignments')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .maybeSingle();
    if (!data) {
      set({ assignment: null });
      return;
    }
    const program = await get().fetchProgram(data.program_id as string);
    set({
      assignment: {
        ...(data as ProgramAssignment),
        program: program ?? undefined,
      },
    });
  },

  assignProgram: async (programId, clientId, startDate) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    await supabase
      .from('program_assignments')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('client_id', clientId)
      .eq('status', 'active');

    const { error } = await supabase.from('program_assignments').insert({
      program_id: programId,
      client_id: clientId,
      assigned_by: user.id,
      start_date: startDate,
      status: 'active',
    });
    if (error) return { error: error.message };
    if (clientId === user.id) await get().fetchMyAssignment(clientId);
    return { error: null };
  },

  pauseAssignment: async (id) => {
    await supabase
      .from('program_assignments')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', id);
    set(s => ({
      assignment: s.assignment?.id === id ? { ...s.assignment, status: 'paused' } : s.assignment,
    }));
  },

  clear: () => set({ programs: [], assignment: null }),
}));
