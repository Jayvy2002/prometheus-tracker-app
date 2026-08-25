import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { addDaysToDateStr, parseDate, toLocalDateStr } from '../lib/utils';

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

    if (data) {
      set({ streak: data as StreakData, loading: false });
    } else {
      set({ streak: { current_streak: 0, longest_streak: 0, last_activity_date: null }, loading: false });
    }
  },

  recordActivity: async (userId, date) => {
    const current = get().streak;

    const dateKey = date.includes('T') ? toLocalDateStr(parseDate(date)) : date;

    // Already recorded for this date — no-op
    if (current?.last_activity_date === dateKey) return;

    const yesterdayStr = addDaysToDateStr(dateKey, -1);

    const wasYesterday = current?.last_activity_date === yesterdayStr;
    const newCurrent = wasYesterday ? (current?.current_streak ?? 0) + 1 : 1;
    const newLongest = Math.max(newCurrent, current?.longest_streak ?? 0);

    const updatedStreak: StreakData = {
      current_streak: newCurrent,
      longest_streak: newLongest,
      last_activity_date: dateKey,
    };

    const { error } = await supabase
      .from('user_streaks')
      .upsert({
        user_id: userId,
        streak_type: 'overall',
        ...updatedStreak,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,streak_type' });

    // Only update local state if the DB write succeeded
    if (!error) {
      set({ streak: updatedStreak });
    }
  },
}));
