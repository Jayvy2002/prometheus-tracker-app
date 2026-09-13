import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { applyNutritionTargets } from '../lib/clientLive';
import type { UserProfile } from '../lib/types';
import { createAccountRequestGuard, createAccountMutationGuard } from '../lib/accountRequestGuard';

const profileRequests = createAccountRequestGuard();
const profileMutations = createAccountMutationGuard();

interface ProfileState {
  profile: UserProfile | null;
  loading: boolean;
  fetchError: string | null;
  uploadingAvatar: boolean;
  applyEntryIntention: (userId: string, intent: 'solo' | 'find_coach' | 'coach') => void;
  applyCoachingDeparture: (userId: string, endedAt: string) => void;
  fetchProfile: (userId: string, opts?: { silent?: boolean }) => Promise<void>;
  applyRemoteTargets: (
    userId: string,
    targets: Pick<UserProfile, 'daily_calorie_target' | 'protein_target' | 'carbs_target' | 'fat_target'>,
  ) => void;
  updateProfile: (userId: string, data: Partial<UserProfile>) => Promise<{ error: string | null }>;
  uploadAvatar: (userId: string, file: File) => Promise<string | null>;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  loading: true,
  fetchError: null,
  uploadingAvatar: false,

  fetchProfile: async (userId, opts) => {
    const isCurrent = profileRequests.begin(userId);
    if (!isCurrent) return;
    if (!opts?.silent) set({ loading: true, fetchError: null });
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (!isCurrent()) return;
      if (error) {
        console.error('[Prometheus] fetchProfile failed:', error.message);
        set({ loading: false, fetchError: error.message });
        return;
      }
      set({ profile: data as UserProfile | null, loading: false, fetchError: null });
    } catch {
      if (isCurrent()) set({ loading: false, fetchError: 'network' });
    }
  },

  applyEntryIntention: (userId, intent) => {
    const current = get().profile;
    if (current?.id !== userId) return;
    profileRequests.invalidate();
    set({ profile: { ...current, entry_intent: intent, onboarding_completed: true }, loading: false });
  },

  applyCoachingDeparture: (userId, endedAt) => {
    const current = get().profile;
    if (current?.id !== userId || !Number.isFinite(Date.parse(endedAt))) return;
    profileRequests.invalidate();
    set({ profile: { ...current, coach_link_ended_at: endedAt } });
  },

  applyRemoteTargets: (userId, targets) => {
    const current = get().profile;
    const next = applyNutritionTargets(current, userId, targets);
    if (next !== current) set({ profile: next });
  },

  updateProfile: async (userId, updates) => {
    const operation = profileMutations.begin(userId);
    if (!operation) return { error: 'Une modification est en cours ou la session a changé.' };
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select()
        .maybeSingle();
      if (!operation.isCurrent()) return { error: 'La session a changé.' };
      if (error) return { error: error.message };
      if (!data || data.id !== userId) return { error: 'Profil introuvable ou non autorisé.' };
      profileRequests.invalidate();
      // Preserve unrelated changes received while this request was in flight.
      const current = get().profile;
      const patch = Object.fromEntries(Object.keys(updates).map(key => [key, data[key]]));
      set({ profile: current?.id === userId ? { ...current, ...patch, updated_at: data.updated_at } : data as UserProfile, loading: false, fetchError: null });
      return { error: null };
    } catch {
      return { error: 'La modification n’a pas pu être confirmée. Réessaie.' };
    } finally {
      operation.finish();
    }
  },

  uploadAvatar: async (userId, file) => {
    const operation = profileMutations.begin(userId);
    if (!operation) return null;
    set({ uploadingAvatar: true });
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `${userId}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });
      if (!operation.isCurrent() || uploadError) return null;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { data, error } = await supabase
        .from('user_profiles')
        .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select()
        .maybeSingle();
      if (!operation.isCurrent() || error || !data || data.id !== userId) return null;
      profileRequests.invalidate();
      const current = get().profile;
      set({ profile: current?.id === userId
        ? { ...current, avatar_url: data.avatar_url, updated_at: data.updated_at }
        : data as UserProfile, loading: false, fetchError: null });
      return data.avatar_url;
    } catch {
      return null;
    } finally {
      if (operation.isCurrent()) set({ uploadingAvatar: false });
      operation.finish();
    }
  },

  clearProfile: () => {
    profileRequests.invalidate();
    profileMutations.invalidate();
    set({ profile: null, loading: true, fetchError: null, uploadingAvatar: false });
  },
}));

