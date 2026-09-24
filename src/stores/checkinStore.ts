import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { todayStr } from '../lib/utils';
import { clampCheckinScore } from '../lib/checkinScale';
import { track } from '../lib/telemetryClient';
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
      hunger: clampCheckinScore(input.hunger),
      fatigue: clampCheckinScore(input.fatigue),
      sleep_quality: clampCheckinScore(input.sleep_quality),
      sleep_hours: input.sleep_hours ?? null,
      stress: clampCheckinScore(input.stress),
      motivation: clampCheckinScore(input.motivation),
      muscle_soreness: clampCheckinScore(input.muscle_soreness),
      joint_pain: clampCheckinScore(input.joint_pain),
      adherence_nutrition: input.adherence_nutrition ?? null,
      adherence_training: input.adherence_training ?? null,
      energy_level: clampCheckinScore(input.energy_level),
      mood: clampCheckinScore(input.mood),
      notes: input.notes ?? '',
      // Vision §11: custom answers are replaced as a whole for this day (label of the moment kept).
      ...(input.custom_answers !== undefined ? { custom_answers: input.custom_answers } : {}),
      ...(input.template_id !== undefined ? { template_id: input.template_id } : {}),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('daily_checkins')
      .upsert(payload, { onConflict: 'user_id,checked_at' })
      .select()
      .maybeSingle();
    if (error) return { error: error.message };
    const row = data as DailyCheckin;
    track('checkin_saved', { with_notes: !!(input.notes ?? '').trim() });
    set(s => ({
      todayCheckin: row.checked_at === todayStr() ? row : s.todayCheckin,
      checkins: [row, ...s.checkins.filter(c => c.checked_at !== row.checked_at)],
    }));
    return { error: null };
  },

  clear: () => set({ todayCheckin: null, checkins: [] }),
}));
