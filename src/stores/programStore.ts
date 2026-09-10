import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { track } from '../lib/telemetryClient';
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
  setProgramDayFromRoutine: (dayId: string, routine: Routine) => Promise<{ error: string | null }>;
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
  ) => Promise<{ error: string | null }>;
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
  fetchMyAssignment: (clientId: string) => Promise<ProgramAssignment | null>;
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
    // Coquille vide (aucun jour) : une seule insertion, atomique par nature.
    if (days.length === 0) {
      const { data, error } = await supabase
        .from('programs')
        .insert({
          owner_id: program.owner_id,
          name: program.name,
          description: program.description ?? '',
          duration_weeks: program.duration_weeks ?? 8,
        })
        .select()
        .maybeSingle();
      if (error || !data) {
        console.error('createProgram failed:', error?.message);
        return null;
      }
      const shell = { ...(data as Program), days: [] as ProgramDay[] };
      set(s => ({ programs: [shell, ...s.programs] }));
      return (data as Program).id;
    }
    // D01 : programme + jours créés en une seule transaction serveur.
    const { data, error } = await supabase.rpc('create_program_with_days', {
      p_name: program.name ?? '',
      p_description: program.description ?? '',
      p_duration_weeks: program.duration_weeks ?? 8,
      p_days: days.map((day, order_index) => ({
        weekday: day.weekday,
        name: day.name,
        order_index: day.order_index ?? order_index,
      })),
    });
    if (error || !data) {
      console.error('createProgram failed:', error?.message);
      return null;
    }
    const programId = data as string;
    // Les jours créés par la RPC ne portent pas routine_id : on l'applique si besoin.
    for (const day of days) {
      if (!day.routine_id) continue;
      await supabase
        .from('program_days')
        .update({ routine_id: day.routine_id })
        .eq('program_id', programId)
        .eq('weekday', day.weekday);
    }
    const full = await get().fetchProgram(programId);
    if (full) set(s => ({ programs: [full, ...s.programs] }));
    return programId;
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
    // D01 : via la RPC atomique (plus de delete-then-insert non vérifié).
    const result = await get().setProgramDayExercises(
      dayId,
      (routine.exercises ?? []).map(ex => ({
        name: ex.name,
        default_sets: ex.default_sets,
        default_reps: ex.default_reps,
        default_rest_seconds: ex.default_rest_seconds,
        order_index: ex.order_index,
      })),
    );
    if (result.error) return result;
    const { error } = await supabase.from('program_days').update({
      name: routine.name,
      routine_id: routine.id,
    }).eq('id', dayId);
    if (error) return { error: error.message };
    const programId = get().programs.find(p => p.days?.some(d => d.id === dayId))?.id;
    if (programId) await get().fetchProgram(programId);
    return { error: null };
  },

  setProgramDayExercises: async (dayId, exercises) => {
    // D01 : validation + remplacement atomiques côté serveur. Fini le fallback
    // qui dégradait silencieusement les prescriptions (compat schéma au déploiement).
    const { error } = await supabase.rpc('save_program_day_exercises', {
      p_day_id: dayId,
      p_exercises: exercises.map(ex => ({
        name: ex.name,
        default_sets: ex.default_sets,
        default_reps: ex.default_reps,
        default_reps_min: ex.default_reps_min ?? null,
        default_rir: ex.default_rir ?? null,
        default_rest_seconds: ex.default_rest_seconds ?? 90,
        default_weight_kg: ex.default_weight_kg ?? null,
        order_index: ex.order_index,
      })),
    });
    if (error) return { error: error.message };
    const programId = get().programs.find(p => p.days?.some(d => d.id === dayId))?.id;
    if (programId) await get().fetchProgram(programId);
    return { error: null };
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
      const saved = await get().setProgramDayExercises(day.id, exercises.map((ex, order_index) => ({
        name: ex.name,
        default_sets: ex.default_sets,
        default_reps: ex.default_reps,
        default_reps_min: ex.default_reps_min,
        default_rir: ex.default_rir,
        default_rest_seconds: ex.default_rest_seconds,
        default_weight_kg: ex.default_weight_kg,
        order_index,
      })));
      if (saved.error) return { error: saved.error };
      applied = true;
      if (patch.weekday != null) break;
    }
    return applied ? { error: null } : { error: 'Exercise not found in program' };
  },

  syncProgramDays: async (programId, days) => {
    // D01 : réconciliation jours + exercices en une seule transaction serveur.
    const { error } = await supabase.rpc('sync_program_days', {
      p_program_id: programId,
      p_days: days.map((draft, i) => ({
        weekday: draft.weekday,
        name: draft.name,
        order_index: i,
        exercises: draft.exercises.map((ex, order_index) => ({
          name: ex.name,
          default_sets: ex.default_sets,
          default_reps: ex.default_reps,
          default_reps_min: ex.default_reps_min ?? null,
          default_rir: ex.default_rir ?? null,
          default_rest_seconds: ex.default_rest_seconds ?? 90,
          default_weight_kg: ex.default_weight_kg ?? null,
          order_index,
        })),
      })),
    });
    if (error) return { error: error.message };
    await get().fetchProgram(programId);
    return { error: null };
  },

  fetchMyAssignment: async (clientId) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: active } = await supabase
      .from('program_assignments')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .maybeSingle();
    let row = active;
    // After unlink the assignment is paused; the athlete must still read it.
    if (!row && user?.id === clientId) {
      const { data: paused } = await supabase
        .from('program_assignments')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'paused')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      row = paused;
    }
    if (!row) {
      set({ assignment: null });
      return null;
    }
    const program = await get().fetchProgram(row.program_id as string);
    const assignment = {
      ...(row as ProgramAssignment),
      program: program ?? undefined,
    };
    set({ assignment });
    return assignment;
  },

  assignProgram: async (programId, clientId, startDate) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    // S02/D01 : attribution atomique serveur — propriété du programme,
    // autorité (soi ou client actif), interdiction d'auto-assignation coachée
    // et pause de l'ancien actif dans la même transaction.
    const { error } = await supabase.rpc('assign_program_secure', {
      p_program_id: programId,
      p_client_id: clientId,
      p_start_date: startDate,
    });
    if (error) return { error: error.message };
    track('program_assigned', { self: clientId === user.id });
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
