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
  ClientLiftProgress,
  CoachMessage,
  CoachNote,
  CoachNudgeTemplateKey,
  CoachPreview,
  CoachPriority,
  CoachRosterSignals,
  CoachSettings,
  DailyCheckin,
  DailyNutritionPoint,
  NutritionLog,
  ProgressPhoto,
  ProgressPhotoKind,
  UserProfile,
  UserRole,
  WaterLog,
  WeightMeasurement,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../lib/types';
import { mapInterventionRow, parseOnboardingPlanDraft, type ProgramOutlineDraft } from '../lib/coachInterventions';
import { functionsErrorBody, functionsHttpStatus } from '../lib/supabaseFunctions';
import {
  COACH_REALTIME_POLL_MS,
  isInterventionDrafting,
  mergeInterventionRealtime,
  type SecondPingKind,
} from '../lib/coachSecond';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { mapCoachMessage } from '../lib/coachQueue';
import {
  liveMessageState,
  nutritionTargetsFromProfileRow,
  shouldRefreshClientAssignment,
} from '../lib/clientLive';
import { EMPTY_COACH_SETTINGS, mapCoachSettings } from '../lib/coachSettings';
import { aggregateNutritionByDay } from '../lib/coachProgress';
import { useProgramStore } from './programStore';
import { useProfileStore } from './profileStore';
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

function queueDoneKey(day = todayStr()) {
  return `prometheus_queue_done_${day}`;
}

function loadQueueDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(queueDoneKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveQueueDismissed(ids: string[]) {
  try {
    sessionStorage.setItem(queueDoneKey(), JSON.stringify(ids));
  } catch {
    // private mode / quota
  }
}

function omitRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

function dropUnlinkedClient(s: {
  clients: CoachClientSummary[];
  opsRows: ClientOpsRow[];
  priorities: CoachPriority[];
  pendingInterventions: CoachIntervention[];
  sentMessages: CoachMessage[];
  notes: CoachNote[];
  unreadMessageCount: number;
  rosterSignals: CoachRosterSignals;
}, clientId: string) {
  const clients = s.clients.filter(c => c.id !== clientId);
  const opsRows = s.opsRows.filter(r => r.client.id !== clientId);
  const priorities = s.priorities.filter(p => p.clientId !== clientId);
  const pendingInterventions = s.pendingInterventions.filter(r => r.client_id !== clientId);
  const sentMessages = s.sentMessages.filter(m => m.client_id !== clientId);
  const notes = s.notes.filter(n => n.client_id !== clientId);
  const removedUnread = s.sentMessages.filter(
    m => m.client_id === clientId && m.sender_id !== m.coach_id && !m.read_at,
  ).length;
  const signals = s.rosterSignals;
  return {
    clients,
    opsRows,
    priorities,
    pendingInterventions,
    sentMessages,
    notes,
    unreadMessageCount: Math.max(0, s.unreadMessageCount - removedUnread),
    rosterSignals: {
      checkins: signals.checkins.filter(c => c.user_id !== clientId),
      weights: signals.weights.filter(w => w.user_id !== clientId),
      lifts: signals.lifts.filter(l => l.clientId !== clientId),
      lastNoteAt: omitRecordKey(signals.lastNoteAt, clientId),
      lastInterventionAt: omitRecordKey(signals.lastInterventionAt, clientId),
      assignmentStart: omitRecordKey(signals.assignmentStart, clientId),
      assignmentWeeks: omitRecordKey(signals.assignmentWeeks, clientId),
      assignmentName: omitRecordKey(signals.assignmentName, clientId),
      scheduledDays: omitRecordKey(signals.scheduledDays, clientId),
    },
    commandStats: commandStats(opsRows, priorities),
  };
}

let coachRealtimeChannel: RealtimeChannel | null = null;
let coachPollTimer: ReturnType<typeof setInterval> | null = null;
let clientRealtimeChannel: RealtimeChannel | null = null;

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
  sentMessages: CoachMessage[];
  latestCoachMessage: CoachMessage | null;
  unreadMessageCount: number;
  coachSettings: CoachSettings | null;
  queueDismissedIds: string[];
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
  fetchCoachMessages: () => Promise<void>;
  sendCoachMessage: (
    clientId: string,
    body: string,
    templateKey: CoachNudgeTemplateKey,
  ) => Promise<{ error: string | null }>;
  sendClientReply: (body: string) => Promise<{ error: string | null }>;
  markCoachMessageRead: (id: string) => Promise<void>;
  markThreadRead: (clientId: string) => Promise<void>;
  fetchCoachSettings: () => Promise<void>;
  saveCoachSettings: (patch: Partial<Pick<CoachSettings, 'visible_tabs' | 'queue_mode_default' | 'nudge_templates'>>) => Promise<{ error: string | null }>;
  fetchClientNutritionRange: (clientId: string, start: string, end: string, calorieTarget: number) => Promise<DailyNutritionPoint[]>;
  fetchClientLiftHistory: (clientId: string) => Promise<ClientLiftProgress[]>;
  fetchProgressPhotos: (userId: string) => Promise<ProgressPhoto[]>;
  uploadProgressPhoto: (input: {
    file: File;
    takenAt: string;
    kind: ProgressPhotoKind;
    notes?: string;
  }) => Promise<{ photo: ProgressPhoto } | { error: string }>;
  deleteProgressPhoto: (id: string, storagePath: string) => Promise<{ error: string | null }>;
  signProgressPhotoUrls: (photos: ProgressPhoto[]) => Promise<Record<string, string>>;
  dismissQueueItem: (id: string) => void;
  dismissQueueItems: (ids: string[]) => void;
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
  askSecond: (input: {
    kind: SecondPingKind;
    clientId?: string | null;
    programId?: string | null;
    prompt: string;
    screen: string;
    context?: Record<string, unknown>;
  }) => Promise<{ id: string } | { error: string }>;
  startCoachRealtime: () => Promise<void>;
  stopCoachRealtime: () => void;
  startClientRealtime: () => Promise<void>;
  stopClientRealtime: () => void;
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
  endClientLink: (linkClientId: string) => Promise<{ error: string | null }>;
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
  sentMessages: [],
  latestCoachMessage: null,
  unreadMessageCount: 0,
  coachSettings: null,
  queueDismissedIds: loadQueueDismissed(),
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
    type LinkRow = {
      client_id: string;
      created_at: string;
      last_visited_at?: string | null;
      last_nudged_at?: string | null;
    };
    let links: LinkRow[] | null = null;
    const withNudge = await supabase
      .from('coach_client_links')
      .select('client_id, created_at, last_visited_at, last_nudged_at')
      .eq('status', 'active');
    if (withNudge.error) {
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
    } else {
      links = (withNudge.data ?? []) as LinkRow[];
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
    const visitedAt = new Map(links.map(l => [l.client_id as string, l.last_visited_at ?? null]));
    const nudgedAt = new Map(links.map(l => [l.client_id as string, l.last_nudged_at ?? null]));
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
      last_nudged_at: nudgedAt.get(p.id as string) ?? null,
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

  fetchCoachMessages: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ sentMessages: [], unreadMessageCount: 0 });
      return;
    }
    const role = get().coachingRole;
    let query = supabase
      .from('coach_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    query = role === 'coach' ? query.eq('coach_id', user.id) : query.eq('client_id', user.id);
    const { data, error } = await query;
    if (error || !data) {
      set({ sentMessages: [] });
      return;
    }
    const messages = data
      .map(row => mapCoachMessage(row as Record<string, unknown>))
      .filter((row): row is CoachMessage => !!row);
    const unread = messages.filter(m => m.sender_id !== user.id && !m.read_at).length;
    set({ sentMessages: messages, unreadMessageCount: unread });
  },

  sendCoachMessage: async (clientId, body, templateKey) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const trimmed = body.trim();
    if (!trimmed) return { error: 'empty' };
    const { data, error } = await supabase
      .from('coach_messages')
      .insert({
        coach_id: user.id,
        client_id: clientId,
        sender_id: user.id,
        body: trimmed,
        template_key: templateKey,
      })
      .select()
      .maybeSingle();
    if (error || !data) return { error: error?.message ?? 'Failed to send' };
    const iso = new Date().toISOString();
    await supabase
      .from('coach_client_links')
      .update({ last_nudged_at: iso, updated_at: iso })
      .eq('client_id', clientId)
      .eq('status', 'active');
    const mapped = mapCoachMessage(data as Record<string, unknown>);
    set(s => ({
      ...liveMessageState(s.sentMessages, 'INSERT', mapped, user.id),
      clients: s.clients.map(c => (c.id === clientId ? { ...c, last_nudged_at: iso } : c)),
      opsRows: s.opsRows.map(row => (
        row.client.id === clientId
          ? { ...row, client: { ...row.client, last_nudged_at: iso } }
          : row
      )),
    }));
    return { error: null };
  },

  sendClientReply: async (body) => {
    const { data: { user } } = await supabase.auth.getUser();
    const coach = get().myCoach;
    if (!user || !coach) return { error: 'Not authenticated' };
    const trimmed = body.trim();
    if (!trimmed) return { error: 'empty' };
    const { data, error } = await supabase
      .from('coach_messages')
      .insert({
        coach_id: coach.id,
        client_id: user.id,
        sender_id: user.id,
        body: trimmed,
        template_key: 'reply',
      })
      .select()
      .maybeSingle();
    if (error || !data) return { error: error?.message ?? 'Failed to send' };
    const mapped = mapCoachMessage(data as Record<string, unknown>);
    set(s => liveMessageState(s.sentMessages, 'INSERT', mapped, user.id));
    return { error: null };
  },

  markCoachMessageRead: async (id) => {
    const iso = new Date().toISOString();
    await supabase.from('coach_messages').update({ read_at: iso }).eq('id', id);
    set(s => ({
      latestCoachMessage: s.latestCoachMessage?.id === id ? null : s.latestCoachMessage,
      sentMessages: s.sentMessages.map(m => (m.id === id ? { ...m, read_at: iso } : m)),
      unreadMessageCount: Math.max(0, s.unreadMessageCount - 1),
    }));
  },

  markThreadRead: async (clientId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const iso = new Date().toISOString();
    const unread = get().sentMessages.filter(m => m.client_id === clientId && m.sender_id !== user.id && !m.read_at);
    if (unread.length === 0) return;
    await supabase
      .from('coach_messages')
      .update({ read_at: iso })
      .in('id', unread.map(m => m.id));
    set(s => ({
      sentMessages: s.sentMessages.map(m => (
        m.client_id === clientId && m.sender_id !== user.id && !m.read_at
          ? { ...m, read_at: iso }
          : m
      )),
      latestCoachMessage: s.latestCoachMessage && unread.some(m => m.id === s.latestCoachMessage?.id)
        ? null
        : s.latestCoachMessage,
      unreadMessageCount: Math.max(0, s.unreadMessageCount - unread.length),
    }));
  },

  fetchCoachSettings: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ coachSettings: null });
      return;
    }
    const { data, error } = await supabase
      .from('coach_settings')
      .select('*')
      .eq('coach_id', user.id)
      .maybeSingle();
    if (error || !data) {
      set({
        coachSettings: { coach_id: user.id, ...EMPTY_COACH_SETTINGS },
      });
      return;
    }
    set({ coachSettings: mapCoachSettings(data as Record<string, unknown>, user.id) });
  },

  saveCoachSettings: async (patch) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const current = get().coachSettings ?? { coach_id: user.id, ...EMPTY_COACH_SETTINGS };
    const payload = {
      coach_id: user.id,
      visible_tabs: patch.visible_tabs ?? current.visible_tabs,
      queue_mode_default: patch.queue_mode_default ?? current.queue_mode_default,
      nudge_templates: patch.nudge_templates ?? current.nudge_templates,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('coach_settings')
      .upsert(payload, { onConflict: 'coach_id' })
      .select()
      .maybeSingle();
    if (error) return { error: error.message };
    set({
      coachSettings: data
        ? mapCoachSettings(data as Record<string, unknown>, user.id)
        : { ...current, ...patch, updated_at: payload.updated_at },
    });
    return { error: null };
  },

  fetchClientNutritionRange: async (clientId, start, end, calorieTarget) => {
    const { data } = await supabase
      .from('nutrition_logs')
      .select('logged_at, calories, protein, carbs, fat')
      .eq('user_id', clientId)
      .gte('logged_at', start)
      .lte('logged_at', end);
    return aggregateNutritionByDay(
      (data ?? []) as Array<{ logged_at: string; calories: number; protein: number; carbs: number; fat: number }>,
      calorieTarget,
    );
  },

  fetchClientLiftHistory: async (clientId) => {
    const start = addDaysToDateStr(todayStr(), -90);
    const { data: workoutRows } = await supabase
      .from('workouts')
      .select('id, user_id, date, name, completed')
      .eq('user_id', clientId)
      .eq('completed', true)
      .gte('date', `${start}T00:00:00`)
      .order('date', { ascending: false })
      .limit(80);
    const histWorkouts = (workoutRows ?? []) as Array<{
      id: string; user_id: string; date: string; name: string; completed: boolean;
    }>;
    if (histWorkouts.length === 0) return [];
    const { data: exRows } = await supabase
      .from('workout_exercises')
      .select('id, workout_id, name')
      .in('workout_id', histWorkouts.map(w => w.id));
    const exercises = (exRows ?? []) as Array<{ id: string; workout_id: string; name: string }>;
    const sets: Array<{ exercise_id: string; weight_kg: number; reps: number; rir: number; completed: boolean; set_type?: string }> = [];
    const exIds = exercises.map(e => e.id);
    for (let i = 0; i < exIds.length; i += 200) {
      const { data: setRows } = await supabase
        .from('workout_sets')
        .select('exercise_id, weight_kg, reps, rir, completed, set_type')
        .in('exercise_id', exIds.slice(i, i + 200));
      sets.push(...((setRows ?? []) as typeof sets));
    }
    return buildClientLifts(histWorkouts, exercises, sets);
  },

  fetchProgressPhotos: async (userId) => {
    const { data, error } = await supabase
      .from('progress_photos')
      .select('*')
      .eq('user_id', userId)
      .order('taken_at', { ascending: false });
    if (error || !data) return [];
    return data as ProgressPhoto[];
  },

  uploadProgressPhoto: async ({ file, takenAt, kind, notes }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('progress-photos')
      .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
    if (uploadError) return { error: uploadError.message };
    const { data, error } = await supabase
      .from('progress_photos')
      .insert({
        user_id: user.id,
        taken_at: takenAt,
        kind,
        storage_path: path,
        notes: (notes ?? '').trim(),
      })
      .select()
      .maybeSingle();
    if (error || !data) {
      await supabase.storage.from('progress-photos').remove([path]);
      return { error: error?.message ?? 'Failed to save photo' };
    }
    return { photo: data as ProgressPhoto };
  },

  deleteProgressPhoto: async (id, storagePath) => {
    const { error } = await supabase.from('progress_photos').delete().eq('id', id);
    if (error) return { error: error.message };
    await supabase.storage.from('progress-photos').remove([storagePath]);
    return { error: null };
  },

  signProgressPhotoUrls: async (photos) => {
    if (photos.length === 0) return {};
    const { data, error } = await supabase.storage
      .from('progress-photos')
      .createSignedUrls(photos.map(p => p.storage_path), 3600);
    if (error || !data) return {};
    const out: Record<string, string> = {};
    data.forEach((row, i) => {
      if (row.signedUrl && photos[i]) out[photos[i].id] = row.signedUrl;
    });
    return out;
  },

  dismissQueueItem: (id) => {
    get().dismissQueueItems([id]);
  },

  dismissQueueItems: (ids) => {
    if (ids.length === 0) return;
    set(s => {
      const next = [...s.queueDismissedIds];
      const seen = new Set(next);
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          next.push(id);
        }
      }
      saveQueueDismissed(next);
      return { queueDismissedIds: next };
    });
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
    return { available: false, error: 'ai_unavailable' };
  },

  askSecond: async (input) => {
    const { data, error } = await supabase.functions.invoke('ask-second', {
      body: {
        kind: input.kind,
        client_id: input.clientId ?? null,
        program_id: input.programId ?? null,
        prompt: input.prompt,
        screen: input.screen,
        context: input.context ?? {},
      },
    });
    const bodyFromData = (data && typeof data === 'object' && !Array.isArray(data))
      ? data as Record<string, unknown>
      : {};
    const bodyFromError = error ? await functionsErrorBody(error) : {};
    const body = Object.keys(bodyFromData).length > 0 ? bodyFromData : bodyFromError;
    const errCode = typeof body.error === 'string' ? body.error : '';
    const rawIntervention = body.intervention && typeof body.intervention === 'object'
      ? mapInterventionRow(body.intervention as Record<string, unknown>)
      : null;
    const id = typeof body.intervention_id === 'string' ? body.intervention_id : rawIntervention?.id;
    let row = rawIntervention;
    if (!row && id) row = await get().fetchIntervention(id);
    if (row) {
      set(s => ({
        pendingInterventions: mergeInterventionRealtime(s.pendingInterventions, 'INSERT', row),
      }));
      void get().startCoachRealtime();
    }
    if (!row) {
      if (functionsHttpStatus(error) === 429 || errCode === 'DAILY_LIMIT_REACHED') {
        return { error: 'DAILY_LIMIT_REACHED' };
      }
      return { error: errCode || 'ai_unavailable' };
    }
    return { id: row.id };
  },

  startCoachRealtime: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (get().coachingRole !== 'coach') return;
    void get().fetchCoachMessages();
    if (!coachRealtimeChannel) {
      void get().fetchPendingInterventions();
      coachRealtimeChannel = supabase
        .channel(`coach-live-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'coach_interventions',
            filter: `coach_id=eq.${user.id}`,
          },
          payload => {
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const mapped = raw ? mapInterventionRow(raw) : null;
            if (!mapped) {
              void get().fetchPendingInterventions();
              return;
            }
            const event = payload.eventType === 'DELETE' ? 'DELETE' : payload.eventType;
            set(s => ({
              pendingInterventions: mergeInterventionRealtime(s.pendingInterventions, event, mapped),
            }));
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'coach_messages',
            filter: `coach_id=eq.${user.id}`,
          },
          payload => {
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const mapped = raw ? mapCoachMessage(raw) : null;
            if (!mapped) {
              void get().fetchCoachMessages();
              return;
            }
            const event = payload.eventType === 'DELETE' ? 'DELETE' : payload.eventType;
            set(s => liveMessageState(s.sentMessages, event, mapped, user.id));
          },
        )
        .subscribe(status => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            void get().fetchPendingInterventions();
            void get().fetchCoachMessages();
          }
        });
    }
    if (!coachPollTimer) {
      coachPollTimer = setInterval(() => {
        if (get().pendingInterventions.some(isInterventionDrafting)) {
          void get().fetchPendingInterventions();
        }
      }, COACH_REALTIME_POLL_MS);
    }
  },

  stopCoachRealtime: () => {
    if (coachRealtimeChannel) {
      void supabase.removeChannel(coachRealtimeChannel);
      coachRealtimeChannel = null;
    }
    if (coachPollTimer) {
      clearInterval(coachPollTimer);
      coachPollTimer = null;
    }
  },

  startClientRealtime: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (get().coachingRole === 'coach') return;
    void get().fetchMyCoach();
    void get().fetchCoachMessages();
    void useProgramStore.getState().fetchMyAssignment(user.id);
    if (!clientRealtimeChannel) {
      clientRealtimeChannel = supabase
        .channel(`client-live-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'coach_messages',
            filter: `client_id=eq.${user.id}`,
          },
          payload => {
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const mapped = raw ? mapCoachMessage(raw) : null;
            if (!mapped) {
              void get().fetchCoachMessages();
              return;
            }
            const event = payload.eventType === 'DELETE' ? 'DELETE' : payload.eventType;
            set(s => liveMessageState(s.sentMessages, event, mapped, user.id));
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'program_assignments',
            filter: `client_id=eq.${user.id}`,
          },
          payload => {
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            if (!shouldRefreshClientAssignment(payload.eventType, raw, user.id) && payload.eventType !== 'DELETE') {
              return;
            }
            void useProgramStore.getState().fetchMyAssignment(user.id);
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_profiles',
            filter: `id=eq.${user.id}`,
          },
          payload => {
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const targets = nutritionTargetsFromProfileRow(raw);
            if (targets) {
              useProfileStore.getState().applyRemoteTargets(user.id, targets);
              return;
            }
            void useProfileStore.getState().fetchProfile(user.id, { silent: true });
          },
        )
        .subscribe(status => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            void get().fetchCoachMessages();
            void useProgramStore.getState().fetchMyAssignment(user.id);
            void useProfileStore.getState().fetchProfile(user.id, { silent: true });
          }
        });
    }
  },

  stopClientRealtime: () => {
    if (clientRealtimeChannel) {
      void supabase.removeChannel(clientRealtimeChannel);
      clientRealtimeChannel = null;
    }
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
      set({ myCoach: null, latestCoachMessage: null, unreadMessageCount: 0 });
      return;
    }
    const { data: link } = await supabase
      .from('coach_client_links')
      .select('coach_id')
      .eq('client_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!link) {
      set({ myCoach: null, latestCoachMessage: null, unreadMessageCount: 0 });
      return;
    }
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, full_name, avatar_url')
      .eq('id', link.coach_id)
      .maybeSingle();
    if (!profile) {
      set({ myCoach: null, latestCoachMessage: null, unreadMessageCount: 0 });
      return;
    }
    const { data: msgs } = await supabase
      .from('coach_messages')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    const messages = (msgs ?? [])
      .map(row => mapCoachMessage(row as Record<string, unknown>))
      .filter((row): row is CoachMessage => !!row);
    const unread = messages.filter(m => m.sender_id !== user.id && !m.read_at);
    set({
      myCoach: {
        id: profile.id as string,
        full_name: (profile.full_name as string) || '',
        avatar_url: (profile.avatar_url as string) || '',
      },
      latestCoachMessage: unread[0] ?? null,
      sentMessages: messages,
      unreadMessageCount: unread.length,
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
      .limit(90);
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
        note_date: opts?.noteDate ?? todayStr(),
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'not_authenticated' };
    if (linkClientId === user.id) return { error: 'cannot_end_self' };

    const { data, error: rpcError } = await supabase.rpc('end_coach_client_link', {
      p_client_id: linkClientId,
    });
    const rpcMissing = !!rpcError && (
      rpcError.code === 'PGRST202'
      || rpcError.code === '42883'
      || /end_coach_client_link/i.test(rpcError.message)
    );

    if (rpcError && !rpcMissing) {
      return { error: rpcError.message };
    }

    if (!rpcError) {
      const payload = data as { ok?: boolean; error?: string } | null;
      if (payload && payload.ok === false) {
        return { error: payload.error ?? 'not_linked' };
      }
    } else {
      const iso = new Date().toISOString();
      const paused = await supabase
        .from('program_assignments')
        .update({ status: 'paused', updated_at: iso })
        .eq('client_id', linkClientId)
        .eq('assigned_by', user.id)
        .eq('status', 'active');
      if (paused.error) return { error: paused.error.message };
      const ended = await supabase
        .from('coach_client_links')
        .update({ status: 'ended', updated_at: iso })
        .eq('coach_id', user.id)
        .eq('client_id', linkClientId)
        .eq('status', 'active');
      if (ended.error) return { error: ended.error.message };
    }

    set(s => dropUnlinkedClient(s, linkClientId));
    return { error: null };
  },

  clear: () => {
    get().stopCoachRealtime();
    get().stopClientRealtime();
    set({
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
      sentMessages: [],
      latestCoachMessage: null,
      unreadMessageCount: 0,
      coachSettings: null,
      queueDismissedIds: [],
      priorities: [],
      rosterSignals: EMPTY_SIGNALS,
      commandStats: EMPTY_STATS,
    });
  },
}));
