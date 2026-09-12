import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { applyNutritionTargets } from '../lib/clientLive';
import type { UserProfile } from '../lib/types';
import { createAccountRequestGuard } from '../lib/accountRequestGuard';

const profileRequests = createAccountRequestGuard();

interface ProfileState {
  profile: UserProfile | null;
  loading: boolean;
  fetchError: string | null;
  uploadingAvatar: boolean;
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

  applyRemoteTargets: (userId, targets) => {
    const current = get().profile;
    const next = applyNutritionTargets(current, userId, targets);
    if (next !== current) set({ profile: next });
  },

  updateProfile: async (userId, updates) => {
    // D03 : contrat de résultat — un refus RLS / réseau ne ressemble plus à un succès.
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'Profil introuvable ou non autorisé.' };
    set({ profile: data as UserProfile });
    return { error: null };
  },

  uploadAvatar: async (userId, file) => {
    set({ uploadingAvatar: true });
    const ext = file.name.split('.').pop() || 'jpg';
    const filePath = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      set({ uploadingAvatar: false });
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { data } = await supabase
      .from('user_profiles')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (data) set({ profile: data as UserProfile });
    set({ uploadingAvatar: false });
    return avatarUrl;
  },

  clearProfile: () => {
    profileRequests.invalidate();
    set({ profile: null, loading: true, fetchError: null });
  },
}));
