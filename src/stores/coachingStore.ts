import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type {
  AiPlanDraft,
  ClientOpsRow,
  ClientTrackingConfig,
  CoachingRole,
  CoachClientSummary,
  CoachInvite,
  CoachNote,
  CoachPreview,
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
import { buildClientOpsRows, datePrefix, weekAgoStr } from '../lib/coachAlerts';
import { todayStr } from '../lib/utils';

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
  suggestClientPlan: (clientId: string) => Promise<
    { available: true; draft: AiPlanDraft } | { available: false; error: string }
  >;
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
    const { data: links, error } = await supabase
      .from('coach_client_links')
      .select('client_id, created_at')
      .eq('status', 'active');
    if (error || !links?.length) {
      set({ clients: [], loading: false });
      return;
    }
    const ids = links.map(l => l.client_id as string);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, avatar_url, onboarding_completed')
      .in('id', ids);
    const linkedAt = new Map(links.map(l => [l.client_id as string, l.created_at as string]));
    const clients: CoachClientSummary[] = (profiles ?? []).map(p => ({
      id: p.id as string,
      full_name: (p.full_name as string) || '',
      email: (p.email as string) || '',
      avatar_url: (p.avatar_url as string) || '',
      linked_at: linkedAt.get(p.id as string) ?? '',
      onboarding_completed: !!p.onboarding_completed,
    }));
    set({ clients, loading: false });
  },

  fetchCoachOps: async () => {
    set({ opsLoading: true });
    await get().fetchClients();
    const clients = get().clients;
    if (clients.length === 0) {
      set({ opsRows: [], opsLoading: false });
      return;
    }
    const ids = clients.map(c => c.id);
    const today = todayStr();
    const weekAgo = weekAgoStr(today);
    const weekday = new Date().getDay();

    const [
      trackingRes,
      assignmentRes,
      checkinRes,
      nutritionRes,
      weightRes,
      workoutRes,
    ] = await Promise.all([
      supabase.from('client_tracking_config').select('*').in('client_id', ids),
      supabase.from('program_assignments').select('client_id, program_id').in('client_id', ids).eq('status', 'active'),
      supabase.from('daily_checkins').select('user_id').in('user_id', ids).eq('checked_at', today),
      supabase.from('nutrition_logs').select('user_id').in('user_id', ids).eq('logged_at', today),
      supabase.from('weight_measurements').select('user_id').in('user_id', ids).gte('measured_at', weekAgo),
      supabase.from('workouts').select('user_id, date, completed').in('user_id', ids).eq('completed', true).gte('date', `${weekAgo}T00:00:00`),
    ]);

    const assignments = assignmentRes.data ?? [];
    const programIds = [...new Set(assignments.map(a => a.program_id as string))];
    let programDays: { program_id: string; weekday: number }[] = [];
    if (programIds.length > 0) {
      const { data: days } = await supabase
        .from('program_days')
        .select('program_id, weekday')
        .in('program_id', programIds);
      programDays = (days ?? []) as { program_id: string; weekday: number }[];
    }

    const trackingByClient = new Map<string, ClientTrackingConfig>();
    for (const row of (trackingRes.error ? [] : trackingRes.data ?? []) as ClientTrackingConfig[]) {
      trackingByClient.set(row.client_id, row);
    }

    const assignedClientIds = new Set(assignments.map(a => a.client_id as string));
    const programByClient = new Map(assignments.map(a => [a.client_id as string, a.program_id as string]));
    const scheduledWeekdaysByClient = new Map<string, Set<number>>();
    for (const client of clients) {
      const programId = programByClient.get(client.id);
      if (!programId) continue;
      const days = programDays.filter(d => d.program_id === programId).map(d => d.weekday);
      scheduledWeekdaysByClient.set(client.id, new Set(days));
    }

    const workoutDatesByUser = new Map<string, string[]>();
    for (const w of workoutRes.data ?? []) {
      const uid = w.user_id as string;
      const day = datePrefix(w.date as string);
      const list = workoutDatesByUser.get(uid) ?? [];
      list.push(day);
      workoutDatesByUser.set(uid, list);
    }

    const opsRows = buildClientOpsRows(clients, {
      today,
      weekAgo,
      weekday,
      checkinUserIds: new Set((checkinRes.data ?? []).map(r => r.user_id as string)),
      nutritionUserIds: new Set((nutritionRes.data ?? []).map(r => r.user_id as string)),
      weightUserIds: new Set((weightRes.data ?? []).map(r => r.user_id as string)),
      workoutDatesByUser,
      scheduledWeekdaysByClient,
      assignedClientIds,
      trackingByClient,
    });
    set({ opsRows, opsLoading: false });
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

  suggestClientPlan: async (clientId) => {
    const { data, error } = await supabase.functions.invoke('suggest-client-plan', {
      body: { client_id: clientId },
    });
    if (error) return { available: false, error: 'ai_unavailable' };
    if (!data?.available || !data.draft) {
      return { available: false, error: (data?.error as string) || 'ai_unavailable' };
    }
    return { available: true, draft: data.draft as AiPlanDraft };
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
  }),
}));
