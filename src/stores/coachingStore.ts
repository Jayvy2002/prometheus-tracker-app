import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type {
  AiPlanDraft,
  ClientOpsRow,
  ClientTrackingConfig,
  CoachingRole,
  CoachClientSummary,
  CoachCommandStats,
  CoachIntervention,
  CoachInterventionKind,
  CoachInterventionStatus,
  CoachInvite,
  CoachNote,
  CoachPreview,
  CoachPriority,
  CoachRosterSignals,
  DailyCheckin,
  NutritionLog,
  UserProfile,
  UserRole,
  WaterLog,
  WeightMeasurement,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../lib/types';
import { mapInterventionRow, parseOnboardingPlanDraft, type ProgramOutlineDraft } from '../lib/coachInterventions';
import { useProgramStore } from './programStore';
import { buildClientOpsRows, datePrefix, weekAgoStr } from '../lib/coachAlerts';
import { buildClientLifts } from '../lib/coachLifts';
import { buildCoachPriorities, commandStats } from '../lib/coachPriorities';
import { addDaysToDateStr, todayStr } from '../lib/utils';

const PENDING_INVITE_KEY = 'prometheus_pending_invite';
const INTENDED_ROLE_KEY = 'prometheus_intended_coaching_role';

export type IntendedCoachingRole = Extract<CoachingRole, 'coach' | 'client'>;

export function setPendingInviteToken(token: string) {
  sessionStorage.setItem(PENDING_INVITE_KEY, token);
}

export function getPendingInviteToken(): string | null {
  return sessionStorage.getItem(PENDING_INVITE_KEY);
}

export function clearPendingInviteToken() {
  sessionStorage.removeItem(PENDING_INVITE_KEY);
}

export function setIntendedCoachingRole(role: IntendedCoachingRole) {
  try {
    localStorage.setItem(INTENDED_ROLE_KEY, role);
  } catch {
    // private mode / quota
  }
}

export function getIntendedCoachingRole(): IntendedCoachingRole | null {
  try {
    const value = localStorage.getItem(INTENDED_ROLE_KEY);
    return value === 'coach' || value === 'client' ? value : null;
  } catch {
    return null;
  }
}

export function clearIntendedCoachingRole() {
  try {
    localStorage.removeItem(INTENDED_ROLE_KEY);
  } catch {
    // ignore
  }
}

const DEFER_ONBOARDING_KEY = 'prometheus_defer_onboarding';

export function setOnboardingDeferred() {
  try {
    sessionStorage.setItem(DEFER_ONBOARDING_KEY, '1');
  } catch {
    // private mode / quota
  }
}

export function clearOnboardingDeferred() {
  try {
    sessionStorage.removeItem(DEFER_ONBOARDING_KEY);
  } catch {
    // ignore
  }
}

export function isOnboardingDeferred(): boolean {
  try {
    return sessionStorage.getItem(DEFER_ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}

const EMPTY_SIGNALS: CoachRosterSignals = {
  checkins: [],
  weights: [],
  lifts: [],
  lastNoteAt: {},
  lastInterventionAt: {},
  assignmentStart: {},
  assignmentWeeks: {},
  assignmentName: {},
  scheduledDays: {},
};

const EMPTY_STATS: CoachCommandStats = {
  activeClients: 0,
  needAttention: 0,
  checkinsToReview: 0,
  programsMayAdapt: 0,
  important: 0,
};

interface CoachingState {
  coachingRole: CoachingRole;
  billingRole: UserRole['role'] | null;
  roleReady: boolean;
  loading: boolean;
  clients: CoachClientSummary[];
  invites: CoachInvite[];
  myCoach: CoachPreview | null;
  notes: CoachNote[];
  opsRows: ClientOpsRow[];
  opsLoading: boolean;
  pendingInterventions: CoachIntervention[];
  priorities: CoachPriority[];
  rosterSignals: CoachRosterSignals;
  commandStats: CoachCommandStats;
  fetchMyRole: (userId: string) => Promise<void>;
  setCoachingRole: (role: CoachingRole) => Promise<{ error: string | null }>;
  applyIntendedCoachingRole: () => Promise<void>;
  enableCoachMode: () => Promise<{ error: string | null }>;
  disableCoachMode: () => Promise<{ error: string | null }>;
  fetchClients: () => Promise<void>;
  fetchCoachOps: () => Promise<void>;
  fetchClientProfile: (clientId: string) => Promise<UserProfile | null>;
  fetchTrackingConfig: (clientId: string) => Promise<ClientTrackingConfig | null>;
  saveTrackingConfig: (
    clientId: string,
    data: Partial<Pick<ClientTrackingConfig, 'track_weight' | 'track_checkins' | 'track_nutrition' | 'track_workouts' | 'workout_focus' | 'setup_completed_at'>>,
  ) => Promise<{ error: string | null }>;
  setClientNutritionTargets: (
    clientId: string,
    targets: { calories: number; protein: number; carbs: number; fat: number },
  ) => Promise<{ error: string | null }>;
  applyProgramOutline: (clientId: string, outline: ProgramOutlineDraft) => Promise<{ error: string | null }>;
  fetchPendingInterventions: () => Promise<void>;
  fetchIntervention: (id: string) => Promise<CoachIntervention | null>;
  fetchOnboardingPlanDraft: (clientId: string) => Promise<CoachIntervention | null>;
  resolveIntervention: (
    id: string,
    status: Extract<CoachInterventionStatus, 'sent' | 'dismissed' | 'kept'>,
    payload?: Record<string, unknown>,
  ) => Promise<{ error: string | null }>;
  suggestClientPlan: (clientId: string) => Promise<
    { available: true; draft: AiPlanDraft } | { available: false; error: string }
  >;
  createIntervention: (input: {
    clientId: string | null;
    kind: CoachInterventionKind;
    title: string;
    rationale: string;
    payload: Record<string, unknown>;
    source?: string;
  }) => Promise<{ id: string } | { error: string }>;
  touchClientVisit: (clientId: string) => Promise<void>;
  fetchInvites: () => Promise<void>;
  createInvite: (opts?: { days?: number; maxUses?: number }) => Promise<{ token: string } | { error: string }>;
  revokeInvite: (id: string) => Promise<void>;
  fetchMyCoach: () => Promise<void>;
  acceptInvite: (token: string) => Promise<{ ok: boolean; error?: string; coach_name?: string }>;
  previewInvite: (token: string) => Promise<{ valid: boolean; coach_name: string | null }>;
  fetchClientWorkouts: (clientId: string) => Promise<Workout[]>;
  fetchClientWorkout: (workoutId: string) => Promise<Workout | null>;
  fetchClientNutrition: (clientId: string, date: string) => Promise<{ logs: NutritionLog[]; water: WaterLog[] }>;
  fetchClientWeight: (clientId: string) => Promise<WeightMeasurement[]>;
  fetchClientCheckins: (clientId: string) => Promise<DailyCheckin[]>;
  fetchNotes: (clientId: string) => Promise<void>;
  addNote: (clientId: string, body: string, opts?: { noteDate?: string; workoutId?: string }) => Promise<{ error: string | null }>;
  deleteNote: (id: string) => Promise<void>;
  endClientLink: (linkClientId: string) => Promise<void>;
  clear: () => void;
}

export const useCoachingStore = create<CoachingState>((set, get) => ({
  coachingRole: 'none',
  billingRole: null,
  roleReady: false,
  loading: false,
  clients: [],
  invites: [],
  myCoach: null,
  notes: [],
  opsRows: [],
  opsLoading: false,
  pendingInterventions: [],
  priorities: [],
  rosterSignals: EMPTY_SIGNALS,
  commandStats: EMPTY_STATS,

  fetchMyRole: async (userId) => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      const row = data as UserRole | null;
      set({
        coachingRole: row?.coaching_role ?? 'none',
        billingRole: row?.role ?? 'free',
        roleReady: true,
      });
    } catch {
      set({ coachingRole: 'none', billingRole: 'free', roleReady: true });
    }
  },

  setCoachingRole: async (role) => {
    const { data, error } = await supabase.rpc('set_coaching_role', { p_role: role });
    if (error) return { error: error.message };
    set({ coachingRole: (data as CoachingRole) || role });
    return { error: null };
  },

  applyIntendedCoachingRole: async () => {
    if (getPendingInviteToken()) return;
    const intended = getIntendedCoachingRole();
    if (!intended) return;
    // Never promote a visitor to client from a leftover picker claim.
    // Client role is assigned only by accept_coach_invite.
    if (intended !== 'coach') {
      clearIntendedCoachingRole();
      return;
    }
    const result = await get().setCoachingRole(intended);
    if (!result.error) clearIntendedCoachingRole();
  },

  enableCoachMode: async () => get().setCoachingRole('coach'),

  disableCoachMode: async () => get().setCoachingRole('none'),

  fetchClients: async () => {
    set({ loading: true });
    type LinkRow = { client_id: string; created_at: string; last_visited_at?: string | null };
    let links: LinkRow[] | null = null;
    const withVisit = await supabase
      .from('coach_client_links')
      .select('client_id, created_at, last_visited_at')
      .eq('status', 'active');
    if (withVisit.error) {
      const fallback = await supabase
        .from('coach_client_links')
        .select('client_id, created_at')
        .eq('status', 'active');
      if (fallback.error || !fallback.data?.length) {
        set({ clients: [], loading: false });
        return;
      }
      links = fallback.data as LinkRow[];
    } else {
      links = (withVisit.data ?? []) as LinkRow[];
    }
    if (!links.length) {
      set({ clients: [], loading: false });
      return;
    }
    const ids = links.map(l => l.client_id as string);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, avatar_url, onboarding_completed, goal, training_frequency, target_weight_kg, weight_kg')
      .in('id', ids);
    const linkedAt = new Map(links.map(l => [l.client_id as string, l.created_at as string]));
    const visitedAt = new Map(links.map(l => [
      l.client_id as string,
      ((l as { last_visited_at?: string | null }).last_visited_at) ?? null,
    ]));
    const clients: CoachClientSummary[] = (profiles ?? []).map(p => ({
      id: p.id as string,
      full_name: (p.full_name as string) || '',
      email: (p.email as string) || '',
      avatar_url: (p.avatar_url as string) || '',
      linked_at: linkedAt.get(p.id as string) ?? '',
      onboarding_completed: !!p.onboarding_completed,
      goal: (p.goal as string) || '',
      training_frequency: Number(p.training_frequency) || 0,
      target_weight_kg: Number(p.target_weight_kg) || 0,
      weight_kg: Number(p.weight_kg) || 0,
      last_visited_at: visitedAt.get(p.id as string) ?? null,
    }));
    set({ clients, loading: false });
  },

  fetchCoachOps: async () => {
    set({ opsLoading: true });
    await Promise.all([get().fetchClients(), get().fetchPendingInterventions()]);
    const clients = get().clients;
    if (clients.length === 0) {
      set({
        opsRows: [],
        opsLoading: false,
        priorities: [],
        rosterSignals: EMPTY_SIGNALS,
        commandStats: EMPTY_STATS,
      });
      return;
    }
    const ids = clients.map(c => c.id);
    const today = todayStr();
    const weekAgo = weekAgoStr(today);
    const threeWeeks = addDaysToDateStr(today, -20);
    const weekday = new Date().getDay();

    const [
      trackingRes,
      assignmentRes,
      checkinTodayRes,
      nutritionRes,
      weightWeekRes,
      workoutWeekRes,
      checkinHistRes,
      weightHistRes,
      workoutHistRes,
      notesRes,
      interventionHistRes,
    ] = await Promise.all([
      supabase.from('client_tracking_config').select('*').in('client_id', ids),
      supabase.from('program_assignments').select('client_id, program_id, start_date').in('client_id', ids).eq('status', 'active'),
      supabase.from('daily_checkins').select('user_id').in('user_id', ids).eq('checked_at', today),
      supabase.from('nutrition_logs').select('user_id').in('user_id', ids).eq('logged_at', today),
      supabase.from('weight_measurements').select('user_id').in('user_id', ids).gte('measured_at', weekAgo),
      supabase.from('workouts').select('user_id, date, completed').in('user_id', ids).eq('completed', true).gte('date', `${weekAgo}T00:00:00`),
      supabase.from('daily_checkins').select('*').in('user_id', ids).gte('checked_at', threeWeeks).order('checked_at', { ascending: false }),
      supabase.from('weight_measurements').select('*').in('user_id', ids).gte('measured_at', threeWeeks).order('measured_at', { ascending: false }),
      supabase.from('workouts').select('id, user_id, date, name, completed').in('user_id', ids).eq('completed', true).gte('date', `${threeWeeks}T00:00:00`).order('date', { ascending: false }).limit(400),
      supabase.from('coach_notes').select('client_id, created_at').in('client_id', ids).order('created_at', { ascending: false }),
      supabase.from('coach_interventions').select('client_id, resolved_at, updated_at, status').in('client_id', ids).in('status', ['sent', 'kept']),
    ]);

    const assignments = assignmentRes.data ?? [];
    const programIds = [...new Set(assignments.map(a => a.program_id as string))];
    let programDays: { program_id: string; weekday: number }[] = [];
    const programMeta = new Map<string, { name: string; duration_weeks: number }>();
    if (programIds.length > 0) {
      const [{ data: days }, { data: programs }] = await Promise.all([
        supabase.from('program_days').select('program_id, weekday').in('program_id', programIds),
        supabase.from('programs').select('id, name, duration_weeks').in('id', programIds),
      ]);
      programDays = (days ?? []) as { program_id: string; weekday: number }[];
      for (const p of programs ?? []) {
        programMeta.set(p.id as string, {
          name: (p.name as string) || '',
          duration_weeks: Number(p.duration_weeks) || 8,
        });
      }
    }

    const trackingByClient = new Map<string, ClientTrackingConfig>();
    for (const row of (trackingRes.error ? [] : trackingRes.data ?? []) as ClientTrackingConfig[]) {
      trackingByClient.set(row.client_id, row);
    }

    const assignedClientIds = new Set(assignments.map(a => a.client_id as string));
    const programByClient = new Map(assignments.map(a => [a.client_id as string, a.program_id as string]));
    const scheduledWeekdaysByClient = new Map<string, Set<number>>();
    const assignmentStart: Record<string, string> = {};
    const assignmentWeeks: Record<string, number> = {};
    const assignmentName: Record<string, string> = {};
    const scheduledDays: Record<string, number> = {};
    for (const client of clients) {
      const programId = programByClient.get(client.id);
      if (!programId) continue;
      const days = programDays.filter(d => d.program_id === programId).map(d => d.weekday);
      scheduledWeekdaysByClient.set(client.id, new Set(days));
      scheduledDays[client.id] = days.length;
      const asg = assignments.find(a => a.client_id === client.id);
      if (asg) assignmentStart[client.id] = asg.start_date as string;
      const meta = programMeta.get(programId);
      if (meta) {
        assignmentWeeks[client.id] = meta.duration_weeks;
        assignmentName[client.id] = meta.name;
      }
    }

    const workoutDatesByUser = new Map<string, string[]>();
    for (const w of workoutWeekRes.data ?? []) {
      const uid = w.user_id as string;
      const day = datePrefix(w.date as string);
      const list = workoutDatesByUser.get(uid) ?? [];
      list.push(day);
      workoutDatesByUser.set(uid, list);
    }

    const histWorkouts = (workoutHistRes.data ?? []) as Array<{
      id: string; user_id: string; date: string; name: string; completed: boolean;
    }>;
    const workoutIds = histWorkouts.map(w => w.id);
    let exercises: Array<{ id: string; workout_id: string; name: string }> = [];
    const sets: Array<{ exercise_id: string; weight_kg: number; reps: number; rir: number; completed: boolean; set_type?: string }> = [];
    if (workoutIds.length > 0) {
      const { data: exRows } = await supabase
        .from('workout_exercises')
        .select('id, workout_id, name')
        .in('workout_id', workoutIds);
      exercises = (exRows ?? []) as Array<{ id: string; workout_id: string; name: string }>;
      const exIds = exercises.map(e => e.id);
      if (exIds.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < exIds.length; i += 200) chunks.push(exIds.slice(i, i + 200));
        for (const chunk of chunks) {
          const { data: setRows } = await supabase
            .from('workout_sets')
            .select('exercise_id, weight_kg, reps, rir, completed, set_type')
            .in('exercise_id', chunk);
          sets.push(...((setRows ?? []) as typeof sets));
        }
      }
    }

    const lastNoteAt: Record<string, string> = {};
    for (const n of notesRes.data ?? []) {
      const id = n.client_id as string;
      if (!lastNoteAt[id]) lastNoteAt[id] = n.created_at as string;
    }
    const lastInterventionAt: Record<string, string> = {};
    for (const row of interventionHistRes.data ?? []) {
      const id = row.client_id as string | null;
      if (!id) continue;
      const at = (row.resolved_at as string) || (row.updated_at as string);
      if (!lastInterventionAt[id] || at > lastInterventionAt[id]) lastInterventionAt[id] = at;
    }

    const opsRows = buildClientOpsRows(clients, {
      today,
      weekAgo,
      weekday,
      checkinUserIds: new Set((checkinTodayRes.data ?? []).map(r => r.user_id as string)),
      nutritionUserIds: new Set((nutritionRes.data ?? []).map(r => r.user_id as string)),
      weightUserIds: new Set((weightWeekRes.data ?? []).map(r => r.user_id as string)),
      workoutDatesByUser,
      scheduledWeekdaysByClient,
      assignedClientIds,
      trackingByClient,
    });

    const rosterSignals: CoachRosterSignals = {
      checkins: (checkinHistRes.data ?? []) as DailyCheckin[],
      weights: (weightHistRes.data ?? []) as WeightMeasurement[],
      lifts: buildClientLifts(histWorkouts, exercises, sets),
      lastNoteAt,
      lastInterventionAt,
      assignmentStart,
      assignmentWeeks,
      assignmentName,
      scheduledDays,
    };
    const priorities = buildCoachPriorities(opsRows, rosterSignals);
    set({
      opsRows,
      opsLoading: false,
      rosterSignals,
      priorities,
      commandStats: commandStats(opsRows, priorities),
    });
  },

  fetchClientProfile: async (clientId) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', clientId)
      .maybeSingle();
    return (data as UserProfile | null) ?? null;
  },

  fetchTrackingConfig: async (clientId) => {
    const { data } = await supabase
      .from('client_tracking_config')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();
    return (data as ClientTrackingConfig | null) ?? null;
  },

  saveTrackingConfig: async (clientId, data) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const payload = {
      coach_id: user.id,
      client_id: clientId,
      track_weight: data.track_weight ?? true,
      track_checkins: data.track_checkins ?? true,
      track_nutrition: data.track_nutrition ?? true,
      track_workouts: data.track_workouts ?? true,
      workout_focus: data.workout_focus ?? '',
      setup_completed_at: data.setup_completed_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('client_tracking_config')
      .upsert(payload, { onConflict: 'coach_id,client_id' });
    if (error) return { error: error.message };
    return { error: null };
  },

  setClientNutritionTargets: async (clientId, targets) => {
    const { error } = await supabase.rpc('coach_set_client_nutrition_targets', {
      p_client_id: clientId,
      p_calories: Math.round(targets.calories),
      p_protein: Math.round(targets.protein),
      p_carbs: Math.round(targets.carbs),
      p_fat: Math.round(targets.fat),
    });
    if (error) return { error: error.message };
    return { error: null };
  },

  applyProgramOutline: async (clientId, outline) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const name = outline.name.trim();
    if (!name || outline.days.length === 0) return { error: null };
    const programs = useProgramStore.getState();
    const programId = await programs.createProgram({
      owner_id: user.id,
      name,
      description: outline.description,
      duration_weeks: outline.duration_weeks,
    }, outline.days.map((d, i) => ({
      weekday: d.weekday,
      name: d.name,
      routine_id: null,
      order_index: i,
    })));
    if (!programId) return { error: 'Failed to create program' };
    const created = await programs.fetchProgram(programId);
    const createdDays = [...(created?.days ?? [])].sort((a, b) => a.order_index - b.order_index);
    for (let i = 0; i < outline.days.length; i++) {
      const draftDay = outline.days[i];
      const row = createdDays.find(d => d.order_index === i) ?? createdDays[i];
      if (!row) continue;
      await programs.setProgramDayExercises(
        row.id,
        (draftDay.exercises ?? []).map((ex, idx) => ({
          name: ex.name,
          default_sets: ex.default_sets || 3,
          default_reps: ex.default_reps || 10,
          default_reps_min: ex.default_reps_min ?? null,
          default_rir: ex.default_rir ?? null,
          default_rest_seconds: ex.default_rest_seconds ?? 90,
          order_index: idx,
        })),
      );
    }
    return programs.assignProgram(programId, clientId, todayStr());
  },

  fetchPendingInterventions: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ pendingInterventions: [] });
      return;
    }
    const { data, error } = await supabase
      .from('coach_interventions')
      .select('*')
      .eq('coach_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error || !data) {
      set({ pendingInterventions: [] });
      return;
    }
    const rows = data
      .map(row => mapInterventionRow(row as Record<string, unknown>))
      .filter((row): row is CoachIntervention => !!row);
    set({ pendingInterventions: rows });
  },

  fetchIntervention: async (id) => {
    const { data, error } = await supabase
      .from('coach_interventions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return mapInterventionRow(data as Record<string, unknown>);
  },

  fetchOnboardingPlanDraft: async (clientId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('coach_interventions')
      .select('*')
      .eq('coach_id', user.id)
      .eq('client_id', clientId)
      .eq('kind', 'onboarding_plan')
      .eq('status', 'pending')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return mapInterventionRow(data as Record<string, unknown>);
  },

  resolveIntervention: async (id, status, payload) => {
    const updates: Record<string, unknown> = {
      status,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (payload) updates.payload = payload;
    const { error } = await supabase
      .from('coach_interventions')
      .update(updates)
      .eq('id', id)
      .eq('status', 'pending');
    if (error) return { error: error.message };
    set(s => ({
      pendingInterventions: s.pendingInterventions.filter(row => row.id !== id),
    }));
    return { error: null };
  },

  suggestClientPlan: async (clientId) => {
    const stored = await get().fetchOnboardingPlanDraft(clientId);
    const parsed = stored ? parseOnboardingPlanDraft(stored.payload) : null;
    if (parsed) return { available: true, draft: parsed };
    const { data, error } = await supabase.functions.invoke('suggest-client-plan', {
      body: { client_id: clientId },
    });
    if (error) return { available: false, error: 'ai_unavailable' };
    if (!data?.available || !data.draft) {
      return { available: false, error: (data?.error as string) || 'ai_unavailable' };
    }
    return { available: true, draft: data.draft as AiPlanDraft };
  },

  createIntervention: async (input) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const row = {
      coach_id: user.id,
      client_id: input.clientId,
      kind: input.kind,
      title: input.title,
      rationale: input.rationale,
      payload: { ...input.payload, source: input.source ?? 'prometheus_local' },
      status: 'pending' as const,
      source: input.source ?? 'prometheus_local',
    };
    const inserted = await supabase.from('coach_interventions').insert(row).select().maybeSingle();
    if (inserted.error || !inserted.data) {
      const { data, error } = await supabase.rpc('upsert_coach_intervention', {
        p_coach_id: user.id,
        p_client_id: input.clientId,
        p_kind: input.kind,
        p_rationale: input.rationale,
        p_payload: row.payload,
        p_title: input.title,
      });
      if (error || !data) return { error: error?.message ?? inserted.error?.message ?? 'Failed to create draft' };
      await get().fetchPendingInterventions();
      return { id: data as string };
    }
    const mapped = mapInterventionRow(inserted.data as Record<string, unknown>);
    if (mapped) {
      set(s => ({ pendingInterventions: [mapped, ...s.pendingInterventions] }));
    }
    return { id: inserted.data.id as string };
  },

  touchClientVisit: async (clientId) => {
    const iso = new Date().toISOString();
    await supabase
      .from('coach_client_links')
      .update({ last_visited_at: iso, updated_at: iso })
      .eq('client_id', clientId)
      .eq('status', 'active');
    // Keep the in-memory last_visited_at as the previous visit so Client 360
    // "since last visit" is computed against what the coach had not yet seen.
  },

  fetchInvites: async () => {
    const { data } = await supabase
      .from('coach_invites')
      .select('*')
      .order('created_at', { ascending: false });
    set({ invites: (data ?? []) as CoachInvite[] });
  },

  createInvite: async (opts) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const days = opts?.days ?? 7;
    const maxUses = opts?.maxUses ?? 1;
    const token = crypto.randomUUID().replace(/-/g, '');
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    const { data, error } = await supabase
      .from('coach_invites')
      .insert({
        coach_id: user.id,
        token,
        expires_at: expires,
        max_uses: maxUses,
      })
      .select()
      .maybeSingle();
    if (error || !data) return { error: error?.message ?? 'Failed to create invite' };
    set(s => ({ invites: [data as CoachInvite, ...s.invites] }));
    return { token };
  },

  revokeInvite: async (id) => {
    await supabase.from('coach_invites').delete().eq('id', id);
    set(s => ({ invites: s.invites.filter(i => i.id !== id) }));
  },

  fetchMyCoach: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ myCoach: null });
      return;
    }
    const { data: link } = await supabase
      .from('coach_client_links')
      .select('coach_id')
      .eq('client_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!link) {
      set({ myCoach: null });
      return;
    }
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, full_name, avatar_url')
      .eq('id', link.coach_id)
      .maybeSingle();
    if (!profile) {
      set({ myCoach: null });
      return;
    }
    set({
      myCoach: {
        id: profile.id as string,
        full_name: (profile.full_name as string) || '',
        avatar_url: (profile.avatar_url as string) || '',
      },
    });
  },

  acceptInvite: async (token) => {
    const { data, error } = await supabase.rpc('accept_coach_invite', { p_token: token });
    if (error) return { ok: false, error: error.message };
    const result = data as { ok?: boolean; error?: string; coach_name?: string };
    if (!result?.ok) return { ok: false, error: result?.error ?? 'failed' };
    clearPendingInviteToken();
    clearIntendedCoachingRole();
    await get().fetchMyCoach();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await get().fetchMyRole(user.id);
    return { ok: true, coach_name: result.coach_name };
  },

  previewInvite: async (token) => {
    const { data, error } = await supabase.rpc('get_coach_invite_preview', { p_token: token });
    if (error) return { valid: false, coach_name: null };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { valid: false, coach_name: null };
    return {
      valid: !!row.valid,
      coach_name: (row.coach_name as string) || null,
    };
  },

  fetchClientWorkouts: async (clientId) => {
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', clientId)
      .order('date', { ascending: false })
      .limit(60);
    return (data ?? []) as Workout[];
  },

  fetchClientWorkout: async (workoutId) => {
    const { data: workout } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', workoutId)
      .maybeSingle();
    if (!workout) return null;
    const { data: exercises } = await supabase
      .from('workout_exercises')
      .select('*')
      .eq('workout_id', workoutId)
      .order('order_index');
    const exIds = (exercises ?? []).map(e => e.id);
    let sets: WorkoutSet[] = [];
    if (exIds.length > 0) {
      const { data: setsData } = await supabase
        .from('workout_sets')
        .select('*')
        .in('exercise_id', exIds)
        .order('order_index');
      sets = (setsData ?? []) as WorkoutSet[];
    }
    const fullExercises = (exercises ?? []).map(ex => ({
      ...ex,
      sets: sets.filter(s => s.exercise_id === ex.id),
    })) as WorkoutExercise[];
    return { ...workout, exercises: fullExercises } as Workout;
  },

  fetchClientNutrition: async (clientId, date) => {
    const [{ data: logs }, { data: water }] = await Promise.all([
      supabase.from('nutrition_logs').select('*').eq('user_id', clientId).eq('logged_at', date),
      supabase.from('water_logs').select('*').eq('user_id', clientId).eq('logged_at', date),
    ]);
    return {
      logs: (logs ?? []) as NutritionLog[],
      water: (water ?? []) as WaterLog[],
    };
  },

  fetchClientWeight: async (clientId) => {
    const { data } = await supabase
      .from('weight_measurements')
      .select('*')
      .eq('user_id', clientId)
      .order('measured_at', { ascending: false })
      .limit(30);
    return (data ?? []) as WeightMeasurement[];
  },

  fetchClientCheckins: async (clientId) => {
    const { data } = await supabase
      .from('daily_checkins')
      .select('*')
      .eq('user_id', clientId)
      .order('checked_at', { ascending: false })
      .limit(21);
    return (data ?? []) as DailyCheckin[];
  },

  fetchNotes: async (clientId) => {
    const { data } = await supabase
      .from('coach_notes')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    set({ notes: (data ?? []) as CoachNote[] });
  },

  addNote: async (clientId, body, opts) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await supabase
      .from('coach_notes')
      .insert({
        coach_id: user.id,
        client_id: clientId,
        body: body.trim(),
        note_date: opts?.noteDate ?? null,
        workout_id: opts?.workoutId ?? null,
      })
      .select()
      .maybeSingle();
    if (error || !data) return { error: error?.message ?? 'Failed to save note' };
    set(s => ({ notes: [data as CoachNote, ...s.notes] }));
    return { error: null };
  },

  deleteNote: async (id) => {
    await supabase.from('coach_notes').delete().eq('id', id);
    set(s => ({ notes: s.notes.filter(n => n.id !== id) }));
  },

  endClientLink: async (linkClientId) => {
    await supabase
      .from('coach_client_links')
      .update({ status: 'ended', updated_at: new Date().toISOString() })
      .eq('client_id', linkClientId)
      .eq('status', 'active');
    set(s => ({ clients: s.clients.filter(c => c.id !== linkClientId) }));
  },

  clear: () => set({
    coachingRole: 'none',
    billingRole: null,
    roleReady: false,
    clients: [],
    invites: [],
    myCoach: null,
    notes: [],
    opsRows: [],
    opsLoading: false,
    pendingInterventions: [],
    priorities: [],
    rosterSignals: EMPTY_SIGNALS,
    commandStats: EMPTY_STATS,
  }),
}));
