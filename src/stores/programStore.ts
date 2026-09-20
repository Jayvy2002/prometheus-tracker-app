import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { track } from '../lib/telemetryClient';
import { resolvePatchTargets } from '../lib/programPatch';
import { todayStr } from '../lib/utils';
import type {
  Program,
  ProgramAssignment,
  ProgramDay,
  ProgramDayExercise,
  ProgramExerciseDraft,
  Routine,
  SessionOrganization,
  SetType,
} from '../lib/types';
import { programExerciseRpcFields } from '../lib/programSetPrescription';
import { snapshotToDayDrafts, parseRevisionOrganization, parseRevisionMeta, snapshotToPhaseDrafts, type ProgramRevisionRow } from '../lib/programRevisionDiff';
import { normalizeSessionOrganization } from '../features/programs/domain/sessionOrganization';
import type { ProgramPhase, ProgramPhaseDraft } from '../features/programs/domain/programPhases';

type ProgramDayDraft = {
  id?: string;
  weekday: number | null;
  name: string;
  phase_id?: string | null;
  exercises: Array<{
    name: string;
    default_sets: number;
    default_reps: number;
    default_reps_min?: number | null;
    default_rir?: number | null;
    default_rest_seconds?: number;
    default_weight_kg?: number | null;
    set_type?: SetType;
    superset_group?: string | null;
    drop_count?: number | null;
    tempo?: string | null;
    isometric_seconds?: number | null;
    cluster_rest_seconds?: number | null;
    cluster_reps_per_burst?: number | null;
    myo_activation?: boolean;
  }>;
};

function rpcDaysPayload(days: ProgramDayDraft[]) {
  return days.map((draft, i) => ({
    id: draft.id ?? null,
    weekday: draft.weekday,
    name: draft.name,
    phase_id: draft.phase_id ?? null,
    order_index: i,
    exercises: draft.exercises.map((ex, order_index) => ({
      ...programExerciseRpcFields(ex),
      order_index,
    })),
  }));
}

function rpcPhasesPayload(phases: ProgramPhaseDraft[]) {
  return phases.map((phase, order_index) => ({
    id: phase.id ?? null,
    name: phase.name,
    description: phase.description ?? '',
    duration_weeks: phase.duration_weeks,
    order_index,
  }));
}

function programDaysToSavePayload(days: ProgramDay[] | undefined): ProgramDayDraft[] {
  return (days ?? []).map(day => ({
    id: day.id,
    weekday: day.weekday,
    name: day.name,
    phase_id: day.phase_id ?? null,
    exercises: (day.exercises ?? []).map(ex => ({
      name: ex.name,
      default_sets: ex.default_sets,
      default_reps: ex.default_reps,
      default_reps_min: ex.default_reps_min,
      default_rir: ex.default_rir,
      default_rest_seconds: ex.default_rest_seconds,
      default_weight_kg: ex.default_weight_kg,
      set_type: ex.set_type,
      superset_group: ex.superset_group,
      drop_count: ex.drop_count,
      tempo: ex.tempo,
      isometric_seconds: ex.isometric_seconds,
      cluster_rest_seconds: ex.cluster_rest_seconds,
      cluster_reps_per_burst: ex.cluster_reps_per_burst,
      myo_activation: ex.myo_activation,
    })),
  }));
}

interface ProgramState {
  programs: Program[];
  programsError: string | null;
  assignment: ProgramAssignment | null;
  loading: boolean;
  fetchPrograms: (ownerId: string) => Promise<void>;
  fetchProgram: (programId: string) => Promise<Program | null>;
  createProgram: (
    program: Omit<Partial<Program>, 'phases'> & { phases?: ProgramPhaseDraft[] },
    days: Array<Omit<ProgramDay, 'id' | 'program_id' | 'created_at' | 'exercises'> & {
      exercises?: Array<ProgramExerciseDraft & { order_index?: number }>;
    }>,
    opts?: { assignClientId?: string; startDate?: string },
  ) => Promise<string | null>;
  updateProgram: (id: string, data: Partial<Program>) => Promise<{ error: string | null }>;
  saveProgram: (
    programId: string,
    meta: { name: string; description: string; duration_weeks: number; session_organization?: SessionOrganization | null },
    days: ProgramDayDraft[],
    expectedUpdatedAt?: string | null,
    phases?: ProgramPhaseDraft[] | null,
  ) => Promise<{ error: string | null }>;
  deleteProgram: (id: string) => Promise<{ error: string | null }>;
  setProgramDayFromRoutine: (dayId: string, routine: Routine) => Promise<{ error: string | null }>;
  setProgramDayExercises: (
    dayId: string,
    exercises: Array<ProgramExerciseDraft & { order_index: number }>,
  ) => Promise<{ error: string | null }>;
  applyExercisePatch: (
    programId: string,
    patch: {
      exercise: string;
      exercise_id?: string | null;
      program_day_id?: string | null;
      weekday?: number | null;
      default_sets?: number;
      default_reps?: number;
      default_reps_min?: number | null;
      default_rir?: number | null;
      default_rest_seconds?: number;
      default_weight_kg?: number | null;
      replace_with?: string;
    },
    opts?: {
      /** I02 : patch "pour cet athlète uniquement" — fork si le modèle est partagé. */
      forClientId?: string;
      /** I02 : updated_at vu par l'aperçu — refuse si le programme a bougé. */
      expectedUpdatedAt?: string | null;
      /** Nom du clone lors d'un fork (défaut : "… (adapté)"). */
      forkName?: string;
    },
  ) => Promise<{ error: string | null; programId?: string; forked?: boolean }>;
  syncProgramDays: (
    programId: string,
    days: ProgramDayDraft[],
  ) => Promise<{ error: string | null }>;
  fetchMyAssignment: (clientId: string) => Promise<ProgramAssignment | null>;
  /** C04 : attributions en pause avec programme (archives consultables). */
  fetchPausedAssignments: (clientId: string) => Promise<ProgramAssignment[]>;
  /** E01 : dernière révision (numéro + date) — le passé ne se réécrit pas. */
  fetchProgramRevisionInfo: (programId: string) => Promise<{ revision_no: number; created_at: string; count: number } | null>;
  fetchProgramRevisions: (programId: string) => Promise<ProgramRevisionRow[]>;
  restoreProgramRevision: (
    programId: string,
    revisionNo: number,
    meta: { name: string; description: string; duration_weeks: number; session_organization?: SessionOrganization | null },
    expectedUpdatedAt?: string | null,
  ) => Promise<{ error: string | null }>;
  saveProgramVersion: (
    programId: string,
    meta: { name: string; description: string; duration_weeks: number; session_organization?: SessionOrganization | null },
    days: ProgramDayDraft[],
    expectedUpdatedAt?: string | null,
    phases?: ProgramPhaseDraft[] | null,
  ) => Promise<{ error: string | null; revisionNo?: number }>;
  scheduleProgramVersion: (
    programId: string,
    revisionNo: number,
    activatesOn: string,
    replace?: boolean,
    expectedUpdatedAt?: string | null,
  ) => Promise<{ error: string | null }>;
  activateProgramVersion: (
    programId: string,
    revisionNo: number,
    expectedUpdatedAt?: string | null,
  ) => Promise<{ error: string | null }>;
  assignProgram: (programId: string, clientId: string, startDate: string) => Promise<{ error: string | null }>;
  duplicateProgram: (programId: string) => Promise<{ error: string | null; programId?: string }>;
  pauseAssignment: (id: string) => Promise<void>;
  clear: () => void;
}

type ProgramRow = Omit<Program, 'days' | 'phases'> & {
  program_days: Array<Omit<ProgramDay, 'exercises'> & { program_day_exercises: ProgramDayExercise[] }>;
  program_phases?: ProgramPhase[] | null;
};

function mapProgramWithDays(row: ProgramRow): Program {
  const days = [...(row.program_days ?? [])]
    .sort((a, b) => a.order_index - b.order_index || (a.weekday ?? 7) - (b.weekday ?? 7))
    .map(d => ({
      ...d,
      exercises: [...(d.program_day_exercises ?? [])].sort((a, b) => a.order_index - b.order_index),
    }));
  const phases = [...(row.program_phases ?? [])].sort((a, b) => a.order_index - b.order_index);
  const { program_days: _omit, program_phases: _omitPhases, ...program } = row;
  void _omit;
  void _omitPhases;
  return {
    ...(program as Program),
    session_organization: normalizeSessionOrganization((program as Program).session_organization),
    phases,
    days,
  };
}

async function hydrateScheduledSnapshot(program: Program): Promise<Program> {
  if (!program.scheduled_revision_no) {
    return { ...program, scheduled_snapshot: null };
  }
  const { data } = await supabase
    .from('program_revisions')
    .select('snapshot')
    .eq('program_id', program.id)
    .eq('revision_no', program.scheduled_revision_no)
    .maybeSingle();
  return { ...program, scheduled_snapshot: data ? (data as { snapshot: unknown }).snapshot : null };
}

export const useProgramStore = create<ProgramState>((set, get) => ({
  programs: [],
  programsError: null,
  assignment: null,
  loading: false,

  fetchPrograms: async (ownerId) => {
    set({ loading: true, programsError: null });
    try {
      // Q05 : programmes + jours + exercices en UNE requête (plus de N+1).
      const { data, error } = await supabase
        .from('programs')
        .select('*, program_phases(*), program_days(*, program_day_exercises(*))')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      set({
        programs: ((data ?? []) as ProgramRow[]).map(mapProgramWithDays),
        programsError: null,
      });
    } catch (err) {
      // UX63 : une erreur n'efface pas la liste déjà là.
      const message = err instanceof Error ? err.message : 'load_failed';
      set({ programsError: message });
    } finally {
      set({ loading: false });
    }
  },

  fetchProgram: async (programId) => {
    try {
      const { data, error } = await supabase
        .from('programs')
        .select('*, program_phases(*), program_days(*, program_day_exercises(*))')
        .eq('id', programId)
        .maybeSingle();
      if (error || !data) return null;
      const program = await hydrateScheduledSnapshot(mapProgramWithDays(data as ProgramRow));
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

  createProgram: async (program, days, opts) => {
    // D01 : toujours la RPC unique (coquille vide, jours, exercices, assignation).
    const { data, error } = await supabase.rpc('create_program_complete', {
      p_name: program.name ?? '',
      p_description: program.description ?? '',
      p_duration_weeks: program.duration_weeks ?? 8,
      p_session_organization: normalizeSessionOrganization(program.session_organization),
      p_phases: rpcPhasesPayload((program.phases ?? []).map(phase => ({
        id: phase.id,
        name: phase.name,
        description: phase.description,
        duration_weeks: phase.duration_weeks ?? null,
      }))),
      p_days: days.map((day, order_index) => ({
        id: 'id' in day ? (day as { id?: string }).id ?? null : null,
        weekday: day.weekday,
        name: day.name,
        phase_id: day.phase_id ?? null,
        order_index: day.order_index ?? order_index,
        routine_id: day.routine_id ?? null,
        exercises: (day.exercises ?? []).map((ex, i) => ({
          ...programExerciseRpcFields(ex),
          order_index: ex.order_index ?? i,
        })),
      })),
      p_assign_client_id: opts?.assignClientId ?? null,
      p_start_date: opts?.startDate ?? null,
    });
    if (error || !data) {
      console.error('createProgram failed:', error?.message);
      return null;
    }
    const programId = data as string;
    const full = await get().fetchProgram(programId);
    if (full) set(s => ({ programs: [full, ...s.programs.filter(p => p.id !== programId)] }));
    if (opts?.assignClientId) await get().fetchMyAssignment(opts.assignClientId);
    return programId;
  },

  updateProgram: async (id, updates) => {
    const existing = get().programs.find(p => p.id === id) ?? await get().fetchProgram(id);
    if (!existing) return { error: 'not_found' };
    return get().saveProgram(id, {
      name: updates.name ?? existing.name,
      description: updates.description ?? existing.description,
      duration_weeks: updates.duration_weeks ?? existing.duration_weeks,
      session_organization: existing.session_organization,
    }, programDaysToSavePayload(existing.days), existing.updated_at, existing.phases);
  },

  saveProgram: async (programId, meta, days, expectedUpdatedAt, phases) => {
    // UX20 : une RPC (métadonnées + jours + révision). Pas d'update puis sync.
    const { error } = await supabase.rpc('save_program', {
      p_program_id: programId,
      p_name: meta.name,
      p_description: meta.description ?? '',
      p_duration_weeks: meta.duration_weeks,
      p_days: rpcDaysPayload(days),
      p_expected_updated_at: expectedUpdatedAt ?? null,
      p_session_organization: meta.session_organization == null
        ? null
        : normalizeSessionOrganization(meta.session_organization),
      p_phases: phases === undefined ? null : rpcPhasesPayload(phases ?? []),
    });
    if (error) return { error: error.message };
    track('program_saved', { days: days.length, weeks: meta.duration_weeks });
    await get().fetchProgram(programId);
    return { error: null };
  },

  deleteProgram: async (id) => {
    // UX20 : ne retire du store qu'après suppression serveur confirmée.
    const { data, error } = await supabase.from('programs').delete().eq('id', id).select('id');
    if (error) return { error: error.message };
    if (!data?.length) return { error: 'not_found' };
    set(s => ({ programs: s.programs.filter(p => p.id !== id) }));
    track('program_deleted');
    return { error: null };
  },

  setProgramDayFromRoutine: async (dayId, routine) => {
    const existing = get().programs.find(p => p.days?.some(d => d.id === dayId));
    if (!existing) return { error: 'not_found' };
    const days = programDaysToSavePayload(existing.days).map(day => (
      day.id === dayId
        ? {
          ...day,
          name: routine.name,
          exercises: (routine.exercises ?? []).map(ex => ({
            name: ex.name,
            default_sets: ex.default_sets,
            default_reps: ex.default_reps,
            default_rest_seconds: ex.default_rest_seconds,
          })),
        }
        : day
    ));
    return get().saveProgram(existing.id, {
      name: existing.name,
      description: existing.description,
      duration_weeks: existing.duration_weeks,
      session_organization: existing.session_organization,
    }, days, existing.updated_at, existing.phases);
  },

  setProgramDayExercises: async (dayId, exercises) => {
    // D01 : validation + remplacement atomiques côté serveur. Fini le fallback
    // qui dégradait silencieusement les prescriptions (compat schéma au déploiement).
    const { error } = await supabase.rpc('save_program_day_exercises', {
      p_day_id: dayId,
      p_exercises: exercises.map(ex => ({
        ...programExerciseRpcFields(ex),
        order_index: ex.order_index,
      })),
    });
    if (error) return { error: error.message };
    const programId = get().programs.find(p => p.days?.some(d => d.id === dayId))?.id;
    if (programId) await get().fetchProgram(programId);
    return { error: null };
  },

  applyExercisePatch: async (programId, patch, opts) => {
    // I02 : UNE cible exacte (même résolveur que l'aperçu), version vérifiée,
    // fork si le modèle est partagé — jamais de retouche silencieuse multi-jours
    // ou multi-athlètes.
    const applyOn = async (targetProgramId: string): Promise<{ error: string | null }> => {
      const program = await get().fetchProgram(targetProgramId);
      if (!program) return { error: 'Program not found' };
      if (opts?.expectedUpdatedAt && program.updated_at !== opts.expectedUpdatedAt) {
        return { error: 'stale' };
      }
      const resolution = resolvePatchTargets(program, patch);
      if (resolution.status === 'not_found') return { error: 'Exercise not found in program' };
      if (resolution.status === 'ambiguous') {
        const where = resolution.targets
          .map(t => t.dayName || `jour ${t.dayWeekday}`)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(', ');
        return { error: `ambiguous: ${where}` };
      }
      const target = resolution.targets[0];
      const day = (program.days ?? []).find(d => d.id === target.dayId);
      if (!day) return { error: 'Exercise not found in program' };
      const exercises = [...(day.exercises ?? [])];
      const idx = exercises.findIndex(ex => ex.id === target.exerciseId);
      if (idx < 0) return { error: 'Exercise not found in program' };
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
      return { error: null };
    };

    // Modèle partagé + patch pour UN athlète → clone, patch du clone, réassigne.
    if (opts?.forClientId) {
      const { data: shared } = await supabase
        .from('program_assignments')
        .select('id')
        .eq('program_id', programId)
        .eq('status', 'active')
        .neq('client_id', opts.forClientId)
        .limit(1);
      if (shared && shared.length > 0) {
        const { data: forkId, error: forkError } = await supabase.rpc('fork_program', {
          p_program_id: programId,
          p_name: opts.forkName ?? null,
        });
        if (forkError || !forkId) return { error: forkError?.message ?? 'Failed to fork program' };
        // Le clone est identique : on résout par nom + weekday (les IDs ont changé).
        const forkPatch = { ...patch, exercise_id: null, program_day_id: null };
        const program = await get().fetchProgram(programId);
        const original = program ? resolvePatchTargets(program, patch) : null;
        const scopedPatch = original?.status === 'ok'
          ? { ...forkPatch, weekday: original.targets[0].dayWeekday }
          : forkPatch;
        const patched = await get().applyExercisePatch(forkId as string, scopedPatch);
        if (patched.error) return { error: patched.error, programId: forkId as string, forked: true };
        const assigned = await get().assignProgram(forkId as string, opts.forClientId, todayStr());
        if (assigned.error) return { error: assigned.error, programId: forkId as string, forked: true };
        return { error: null, programId: forkId as string, forked: true };
      }
    }

    const result = await applyOn(programId);
    if (result.error) return result;
    return { error: null, programId };
  },

  syncProgramDays: async (programId, days) => {
    // D01 : réconciliation jours + exercices en une seule transaction serveur.
    const { error } = await supabase.rpc('sync_program_days', {
      p_program_id: programId,
      p_days: rpcDaysPayload(days),
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
    await supabase.rpc('ensure_due_program_version', { p_program_id: row.program_id });
    const program = await get().fetchProgram(row.program_id as string);
    const assignment = {
      ...(row as ProgramAssignment),
      program: program ?? undefined,
    };
    set({ assignment });
    return assignment;
  },

  fetchPausedAssignments: async (clientId) => {
    const { data } = await supabase
      .from('program_assignments')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 'paused')
      .order('updated_at', { ascending: false })
      .limit(10);
    const rows = (data ?? []) as ProgramAssignment[];
    const out: ProgramAssignment[] = [];
    for (const row of rows) {
      const program = await get().fetchProgram(row.program_id as string);
      out.push({ ...row, program: program ?? undefined });
    }
    return out;
  },

  fetchProgramRevisionInfo: async (programId) => {
    const { data, error } = await supabase
      .from('program_revisions')
      .select('revision_no, created_at')
      .eq('program_id', programId)
      .order('revision_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { revision_no: number; created_at: string };
    return { revision_no: row.revision_no, created_at: row.created_at, count: row.revision_no };
  },

  fetchProgramRevisions: async (programId) => {
    const { data, error } = await supabase
      .from('program_revisions')
      .select('id, program_id, revision_no, snapshot, created_by, created_at, activated_at, superseded_at')
      .eq('program_id', programId)
      .order('revision_no', { ascending: false });
    if (error || !data) return [];
    return data as ProgramRevisionRow[];
  },

  restoreProgramRevision: async (programId, revisionNo, meta, expectedUpdatedAt) => {
    const { data, error } = await supabase
      .from('program_revisions')
      .select('snapshot')
      .eq('program_id', programId)
      .eq('revision_no', revisionNo)
      .maybeSingle();
    if (error || !data) return { error: error?.message ?? 'not_found' };
    const snapshot = (data as { snapshot: unknown }).snapshot;
    const days = snapshotToDayDrafts(snapshot);
    if (!days.length) return { error: 'empty_snapshot' };
    const snapMeta = parseRevisionMeta(snapshot);
    return get().saveProgram(programId, {
      name: snapMeta.name ?? meta.name,
      description: snapMeta.description ?? meta.description,
      duration_weeks: snapMeta.duration_weeks ?? meta.duration_weeks,
      session_organization: parseRevisionOrganization(snapshot),
    }, days, expectedUpdatedAt, snapshotToPhaseDrafts(snapshot));
  },

  saveProgramVersion: async (programId, meta, days, expectedUpdatedAt, phases) => {
    const { data, error } = await supabase.rpc('save_program_version', {
      p_program_id: programId,
      p_name: meta.name,
      p_description: meta.description ?? '',
      p_duration_weeks: meta.duration_weeks,
      p_days: rpcDaysPayload(days),
      p_expected_updated_at: expectedUpdatedAt ?? null,
      p_session_organization: meta.session_organization == null
        ? null
        : normalizeSessionOrganization(meta.session_organization),
      p_phases: phases === undefined ? [] : rpcPhasesPayload(phases ?? []),
    });
    if (error) return { error: error.message };
    await get().fetchProgram(programId);
    return { error: null, revisionNo: data as number };
  },

  scheduleProgramVersion: async (programId, revisionNo, activatesOn, replace, expectedUpdatedAt) => {
    const { error } = await supabase.rpc('schedule_program_version', {
      p_program_id: programId,
      p_revision_no: revisionNo,
      p_activates_on: activatesOn,
      p_replace: replace ?? false,
      p_expected_updated_at: expectedUpdatedAt ?? null,
    });
    if (error) return { error: error.message };
    await get().fetchProgram(programId);
    return { error: null };
  },

  activateProgramVersion: async (programId, revisionNo, expectedUpdatedAt) => {
    const { error } = await supabase.rpc('activate_program_version', {
      p_program_id: programId,
      p_revision_no: revisionNo,
      p_expected_updated_at: expectedUpdatedAt ?? null,
    });
    if (error) return { error: error.message };
    await get().fetchProgram(programId);
    return { error: null };
  },

  duplicateProgram: async (programId) => {
    const { data, error } = await supabase.rpc('fork_program', {
      p_program_id: programId,
      p_name: null,
    });
    if (error || !data) return { error: error?.message ?? 'fork_failed' };
    const program = await get().fetchProgram(data as string);
    if (!program) return { error: 'fork_failed', programId: data as string };
    return { error: null, programId: program.id };
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

  clear: () => set({ programs: [], programsError: null, assignment: null }),
}));
