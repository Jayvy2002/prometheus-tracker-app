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
  updateProgram: (id: string, data: Partial<Program>) => Promise<void>;
  deleteProgram: (id: string) => Promise<void>;
  setProgramDayFromRoutine: (dayId: string, routine: Routine) => Promise<void>;
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
  const { data: exercises } = await supabase
    .from('program_day_exercises')
    .select('*')
    .in('program_day_id', ids)
    .order('order_index');
  const byDay = new Map<string, ProgramDayExercise[]>();
  for (const ex of (exercises ?? []) as ProgramDayExercise[]) {
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
    const { data } = await supabase
      .from('programs')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });
    const list = (data ?? []) as Program[];
    const withDays = await Promise.all(list.map(async p => ({
      ...p,
      days: await loadDays(p.id),
    })));
    set({ programs: withDays, loading: false });
  },

  fetchProgram: async (programId) => {
    const { data } = await supabase.from('programs').select('*').eq('id', programId).maybeSingle();
    if (!data) return null;
    const program = { ...(data as Program), days: await loadDays(programId) };
    set(s => ({
      programs: s.programs.some(p => p.id === programId)
        ? s.programs.map(p => p.id === programId ? program : p)
        : [program, ...s.programs],
    }));
    return program;
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
    await supabase.from('programs').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    set(s => ({
      programs: s.programs.map(p => p.id === id ? { ...p, ...updates } : p),
    }));
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
