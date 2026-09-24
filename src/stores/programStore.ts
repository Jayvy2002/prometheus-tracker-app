import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { track } from '../lib/telemetryClient';
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
import { snapshotToDayDrafts, parseRevisionOrganization, parseRevisionMeta, snapshotToPhaseDrafts, programFromFrozenRevision, type ProgramRevisionRow } from '../lib/programRevisionDiff';
import { normalizeSessionOrganization } from '../features/programs/domain/sessionOrganization';
import type { ProgramPhase, ProgramPhaseDraft } from '../features/programs/domain/programPhases';

type ProgramDayDraft = {
  id?: string;
  weekday: number | null;
  name: string;
  phase_id?: string | null;
  exercises: Array<{
    name: string;
    catalog_exercise_id?: string | null;
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
      catalog_exercise_id: ex.catalog_exercise_id ?? null,
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

async function hydrateAssignmentProgram(
  fetchLive: (programId: string) => Promise<Program | null>,
  row: ProgramAssignment,
): Promise<Program | null> {
  if (row.status !== 'active') {
    const { data, error } = await supabase.rpc('get_frozen_program_archive', {
      p_assignment_id: row.id,
    });
    if (error || !data) return null;
    const archive = data as {
      program_id: string;
      owner_id: string;
      created_at: string;
      updated_at: string;
      frozen_revision_no: number;
      version_start_on?: string | null;
      snapshot: unknown;
    };
    return programFromFrozenRevision({
      meta: {
        id: archive.program_id,
        owner_id: archive.owner_id,
        created_at: archive.created_at,
        updated_at: archive.updated_at,
      },
      revisionNo: archive.frozen_revision_no,
      versionStartOn: archive.version_start_on ?? null,
      snapshot: archive.snapshot,
    });
  }
  return fetchLive(row.program_id);
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
    const { data, error } = await supabase.rpc('delete_program', { p_program_id: id });
    if (error) return { error: error.message };
    if (!data) return { error: 'not_found' };
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
    const assignmentRow = row as ProgramAssignment;
    if (assignmentRow.status === 'active') {
      await supabase.rpc('ensure_due_program_version', { p_program_id: assignmentRow.program_id });
    }
    const program = await hydrateAssignmentProgram(get().fetchProgram, assignmentRow);
    const assignment = {
      ...assignmentRow,
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
      .in('status', ['paused', 'completed'])
      .order('updated_at', { ascending: false })
      .limit(10);
    const rows = (data ?? []) as ProgramAssignment[];
    const out: ProgramAssignment[] = [];
    for (const row of rows) {
      const program = await hydrateAssignmentProgram(get().fetchProgram, row);
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
      .select('id, program_id, revision_no, snapshot, created_by, created_at, activated_at, superseded_at, version_start_on')
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

  clear: () => set({ programs: [], programsError: null, assignment: null }),
}));
