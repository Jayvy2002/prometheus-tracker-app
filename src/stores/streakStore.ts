import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { todayStr } from '../lib/utils';
import { applyQualifyingActivity, effectiveCurrentStreak } from '../lib/streak';

interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
}

interface StreakState {
  streak: StreakData | null;
  loading: boolean;
  fetchStreak: (userId: string) => Promise<void>;
  recordActivity: (userId: string, date: string) => Promise<void>;
  reset: () => void;
}

export const useStreakStore = create<StreakState>((set, get) => ({
  streak: null,
  loading: false,

  fetchStreak: async (userId) => {
    set({ loading: true });
    const { data } = await supabase
      .from('user_streaks')
      .select('current_streak, longest_streak, last_activity_date')
      .eq('user_id', userId)
      .eq('streak_type', 'overall')
      .maybeSingle();

    if (!data) {
      set({ streak: { current_streak: 0, longest_streak: 0, last_activity_date: null }, loading: false });
      return;
    }

    const stored = data as StreakData;
    const current_streak = effectiveCurrentStreak(
      stored.last_activity_date,
      stored.current_streak,
      todayStr(),
    );
    const streak: StreakData = {
      current_streak,
      longest_streak: stored.longest_streak,
      last_activity_date: stored.last_activity_date,
    };
    set({ streak, loading: false });

    if (current_streak !== stored.current_streak) {
      void supabase
        .from('user_streaks')
        .update({ current_streak, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('streak_type', 'overall');
    }
  },

  recordActivity: async (userId, date) => {
    if (get().streak === null) {
      await get().fetchStreak(userId);
    }
    const updatedStreak = applyQualifyingActivity(get().streak, date, todayStr());
    if (!updatedStreak) return;

    const { error } = await supabase
      .from('user_streaks')
      .upsert({
        user_id: userId,
        streak_type: 'overall',
        ...updatedStreak,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,streak_type' });

    if (!error) {
      set({ streak: updatedStreak });
    }
  },

  reset: () => set({ streak: null, loading: false }),
}));
