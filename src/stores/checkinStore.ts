import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { DailyCheckin, WeeklyMetrics } from '../lib/types';
import { todayStr } from '../lib/utils';

interface CheckinState {
  checkins: DailyCheckin[];
  todayCheckin: DailyCheckin | null;
  loading: boolean;
  saving: boolean;

  fetchCheckins: (userId: string, days?: number) => Promise<void>;
  fetchTodayCheckin: (userId: string) => Promise<void>;
  upsertCheckin: (userId: string, data: Partial<DailyCheckin>) => Promise<void>;
  getWeeklyMetrics: (startDate: string, endDate: string) => WeeklyMetrics;
  clearCheckins: () => void;
}

export const useCheckinStore = create<CheckinState>((set, get) => ({
  checkins: [],
  todayCheckin: null,
  loading: false,
  saving: false,

  fetchCheckins: async (userId, days = 60) => {
    set({ loading: true });
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('daily_checkins')
      .select('*')
      .eq('user_id', userId)
      .gte('checked_at', sinceStr)
      .order('checked_at', { ascending: false });

    if (!error && data) {
      const today = todayStr();
      const todayEntry = data.find(c => c.checked_at === today) || null;
      set({ checkins: data, todayCheckin: todayEntry, loading: false });
    } else {
      set({ loading: false });
    }
  },

  fetchTodayCheckin: async (userId) => {
    const today = todayStr();
    const { data } = await supabase
      .from('daily_checkins')
      .select('*')
      .eq('user_id', userId)
      .eq('checked_at', today)
      .maybeSingle();

    if (data) {
      set({ todayCheckin: data });
    }
  },

  upsertCheckin: async (userId, data) => {
    set({ saving: true });
    const today = todayStr();
    const existing = get().todayCheckin;

    if (existing) {
      const { data: updated, error } = await supabase
        .from('daily_checkins')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();

      if (!error && updated) {
        set(state => ({
          todayCheckin: updated,
          checkins: state.checkins.map(c => c.id === updated.id ? updated : c),
          saving: false,
        }));
      } else {
        set({ saving: false });
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('daily_checkins')
        .insert({ ...data, user_id: userId, checked_at: today })
        .select()
        .single();

      if (!error && inserted) {
        set(state => ({
          todayCheckin: inserted,
          checkins: [inserted, ...state.checkins],
          saving: false,
        }));
      } else {
        set({ saving: false });
      }
    }
  },

  getWeeklyMetrics: (startDate, endDate) => {
    const { checkins } = get();
    const weekCheckins = checkins.filter(
      c => c.checked_at >= startDate && c.checked_at <= endDate
    );

    if (weekCheckins.length === 0) {
      return {
        weightAverage: null,
        weightTrend: null,
        hungerAvg: null,
        fatigueAvg: null,
        sleepQualityAvg: null,
        sleepHoursAvg: null,
        stressAvg: null,
        motivationAvg: null,
        sorenessAvg: null,
        jointPainAvg: null,
        adherenceNutritionAvg: null,
        adherenceTrainingAvg: null,
        energyAvg: null,
        moodAvg: null,
        workoutsCompleted: 0,
        totalVolume: 0,
        checkinCount: 0,
      };
    }

    const avg = (field: keyof DailyCheckin) => {
      const vals = weekCheckins.map(c => c[field] as number | null).filter((v): v is number => v !== null);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };

    return {
      weightAverage: null,
      weightTrend: null,
      hungerAvg: avg('hunger'),
      fatigueAvg: avg('fatigue'),
      sleepQualityAvg: avg('sleep_quality'),
      sleepHoursAvg: avg('sleep_hours'),
      stressAvg: avg('stress'),
      motivationAvg: avg('motivation'),
      sorenessAvg: avg('muscle_soreness'),
      jointPainAvg: avg('joint_pain'),
      adherenceNutritionAvg: avg('adherence_nutrition'),
      adherenceTrainingAvg: avg('adherence_training'),
      energyAvg: avg('energy_level'),
      moodAvg: avg('mood'),
      workoutsCompleted: 0,
      totalVolume: 0,
      checkinCount: weekCheckins.length,
    };
  },

  clearCheckins: () => set({ checkins: [], todayCheckin: null }),
}));
