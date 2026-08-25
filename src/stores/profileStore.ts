import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../lib/types';

interface ProfileState {
  profile: UserProfile | null;
  loading: boolean;
  uploadingAvatar: boolean;
  fetchProfile: (userId: string) => Promise<void>;
  updateProfile: (userId: string, data: Partial<UserProfile>) => Promise<void>;
  uploadAvatar: (userId: string, file: File) => Promise<string | null>;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  loading: true,
  uploadingAvatar: false,

  fetchProfile: async (userId) => {
    set({ loading: true });
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    set({ profile: data as UserProfile | null, loading: false });
  },

  updateProfile: async (userId, updates) => {
    const { data } = await supabase
      .from('user_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .maybeSingle();
    if (data) set({ profile: data as UserProfile });
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

  clearProfile: () => set({ profile: null, loading: true }),
}));
