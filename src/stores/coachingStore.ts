import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type {
  CoachingRole,
  CoachClientSummary,
  CoachInvite,
  CoachNote,
  CoachPreview,
  DailyCheckin,
  NutritionLog,
  UserRole,
  WaterLog,
  WeightMeasurement,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../lib/types';

const PENDING_INVITE_KEY = 'prometheus_pending_invite';

export function setPendingInviteToken(token: string) {
  sessionStorage.setItem(PENDING_INVITE_KEY, token);
}

export function getPendingInviteToken(): string | null {
  return sessionStorage.getItem(PENDING_INVITE_KEY);
}

export function clearPendingInviteToken() {
  sessionStorage.removeItem(PENDING_INVITE_KEY);
}

interface CoachingState {
  coachingRole: CoachingRole;
  billingRole: UserRole['role'] | null;
  loading: boolean;
  clients: CoachClientSummary[];
  invites: CoachInvite[];
  myCoach: CoachPreview | null;
  notes: CoachNote[];
  fetchMyRole: (userId: string) => Promise<void>;
  enableCoachMode: () => Promise<{ error: string | null }>;
  disableCoachMode: () => Promise<{ error: string | null }>;
  fetchClients: () => Promise<void>;
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
  loading: false,
  clients: [],
  invites: [],
  myCoach: null,
  notes: [],

  fetchMyRole: async (userId) => {
    const { data } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    const row = data as UserRole | null;
    set({
      coachingRole: row?.coaching_role ?? 'none',
      billingRole: row?.role ?? 'free',
    });
  },

  enableCoachMode: async () => {
    const { data, error } = await supabase.rpc('set_coaching_role', { p_role: 'coach' });
    if (error) return { error: error.message };
    set({ coachingRole: (data as CoachingRole) || 'coach' });
    return { error: null };
  },

  disableCoachMode: async () => {
    const { data, error } = await supabase.rpc('set_coaching_role', { p_role: 'none' });
    if (error) return { error: error.message };
    set({ coachingRole: (data as CoachingRole) || 'none' });
    return { error: null };
  },

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
      .select('id, full_name, email, avatar_url')
      .in('id', ids);
    const linkedAt = new Map(links.map(l => [l.client_id as string, l.created_at as string]));
    const clients: CoachClientSummary[] = (profiles ?? []).map(p => ({
      id: p.id as string,
      full_name: (p.full_name as string) || '',
      email: (p.email as string) || '',
      avatar_url: (p.avatar_url as string) || '',
      linked_at: linkedAt.get(p.id as string) ?? '',
    }));
    set({ clients, loading: false });
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
    clients: [],
    invites: [],
    myCoach: null,
    notes: [],
  }),
}));
