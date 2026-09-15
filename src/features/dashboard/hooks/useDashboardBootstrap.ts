import { useEffect, useState } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { useNutritionStore } from '../../../stores/nutritionStore';
import { useWeightStore } from '../../../stores/weightStore';
import { useWorkoutStore } from '../../../stores/workoutStore';
import { useStreakStore } from '../../../stores/streakStore';
import { useRoutineStore } from '../../../stores/routineStore';
import { useCheckinStore } from '../../../stores/checkinStore';
import { useCoachingStore } from '../../../stores/coachingStore';
import { useProgramStore } from '../../../stores/programStore';
import { todayStr } from '../../../lib/utils';
import { supabase } from '../../../lib/supabase';

/** Fetch d’accueil : stores + comptage nutrition. L’écran garde le JSX. */
export function useDashboardBootstrap() {
  const { user } = useAuthStore();
  const { fetchLogs, fetchWaterLogs, fetchOrCreateSteps } = useNutritionStore();
  const { fetchMeasurements } = useWeightStore();
  const { fetchWorkouts } = useWorkoutStore();
  const { fetchStreak } = useStreakStore();
  const { fetchRoutines } = useRoutineStore();
  const { fetchToday, fetchRecent } = useCheckinStore();
  const { fetchMyCoach } = useCoachingStore();
  const { fetchMyAssignment } = useProgramStore();
  const [nutritionHistoryCount, setNutritionHistoryCount] = useState<number | null>(null);
  const [assignmentReady, setAssignmentReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    const today = todayStr();
    fetchLogs(user.id, today);
    fetchWaterLogs(user.id, today);
    void fetchOrCreateSteps(user.id, today);
    fetchMeasurements(user.id);
    fetchWorkouts(user.id);
    fetchStreak(user.id);
    fetchRoutines(user.id);
    fetchToday(user.id);
    fetchRecent(user.id, 14);
    fetchMyCoach();
    setAssignmentReady(false);
    void fetchMyAssignment(user.id).finally(() => setAssignmentReady(true));
    void supabase
      .from('nutrition_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count }) => setNutritionHistoryCount(count ?? 0));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  return { nutritionHistoryCount, assignmentReady };
}
