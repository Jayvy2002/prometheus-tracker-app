import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { CoachingRole, CoachPreview, UserRole } from '../lib/types';

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
  myCoach: CoachPreview | null;
  fetchMyRole: (userId: string) => Promise<void>;
  setCoachingRole: (role: CoachingRole) => Promise<{ error: string | null }>;
  applyIntendedCoachingRole: () => Promise<void>;
  fetchMyCoach: () => Promise<void>;
  acceptInvite: (token: string) => Promise<{ ok: boolean; error?: string; coach_name?: string }>;
  previewInvite: (token: string) => Promise<{ valid: boolean; coach_name: string | null }>;
  clear: () => void;
}

export const useCoachingStore = create<CoachingState>((set, get) => ({
  coachingRole: 'none',
  myCoach: null,

  fetchMyRole: async (userId) => {
    const { data } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    const row = data as UserRole | null;
    set({ coachingRole: row?.coaching_role ?? 'none' });
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
    const result = await get().setCoachingRole(intended);
    if (!result.error) clearIntendedCoachingRole();
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

  clear: () => set({
    coachingRole: 'none',
    myCoach: null,
  }),
}));
