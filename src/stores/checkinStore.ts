import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { todayStr } from '../lib/utils';
import type { DailyCheckin, DailyCheckinInput } from '../lib/types';

interface CheckinState {
  todayCheckin: DailyCheckin | null;
  checkins: DailyCheckin[];
  loading: boolean;
  fetchToday: (userId: string) => Promise<void>;
  fetchRecent: (userId: string, limit?: number) => Promise<void>;
  upsertToday: (userId: string, input: DailyCheckinInput) => Promise<{ error: string | null }>;
  clear: () => void;
}

export const useCheckinStore = create<CheckinState>((set) => ({
  todayCheckin: null,
  checkins: [],
  loading: false,

  fetchToday: async (userId) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('daily_checkins')
      .select('*')
      .eq('user_id', userId)
      .eq('checked_at', todayStr())
      .maybeSingle();
    if (error) {
      console.error('fetchToday checkin failed:', error.message);
    }
    set({ todayCheckin: (data as DailyCheckin | null) ?? null, loading: false });
  },

  fetchRecent: async (userId, limit = 14) => {
    const { data } = await supabase
      .from('daily_checkins')
      .select('*')
      .eq('user_id', userId)
      .order('checked_at', { ascending: false })
      .limit(limit);
    set({ checkins: (data ?? []) as DailyCheckin[] });
  },

  upsertToday: async (userId, input) => {
    const payload = {
      user_id: userId,
      checked_at: input.checked_at || todayStr(),
      hunger: input.hunger ?? null,
      fatigue: input.fatigue ?? null,
      sleep_quality: input.sleep_quality ?? null,
      sleep_hours: input.sleep_hours ?? null,
      stress: input.stress ?? null,
      motivation: input.motivation ?? null,
      muscle_soreness: input.muscle_soreness ?? null,
      joint_pain: input.joint_pain ?? null,
      adherence_nutrition: input.adherence_nutrition ?? null,
      adherence_training: input.adherence_training ?? null,
      energy_level: input.energy_level ?? null,
      mood: input.mood ?? null,
      notes: input.notes ?? '',
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('daily_checkins')
      .upsert(payload, { onConflict: 'user_id,checked_at' })
      .select()
      .maybeSingle();
    if (error) return { error: error.message };
    const row = data as DailyCheckin;
    set(s => ({
      todayCheckin: row,
      checkins: [row, ...s.checkins.filter(c => c.checked_at !== row.checked_at)],
    }));
    return { error: null };
  },

  clear: () => set({ todayCheckin: null, checkins: [] }),
}));
