import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { CoachingRecommendation, UserProfile, WeeklyMetrics } from '../lib/types';
import { analyzeWeeklyData, CoachingDecision } from '../lib/coachingEngine';
import { useCheckinStore } from './checkinStore';

interface CoachingState {
  recommendations: CoachingRecommendation[];
  loading: boolean;
  analyzing: boolean;

  fetchRecommendations: (userId: string) => Promise<void>;
  runWeeklyAnalysis: (userId: string, profile: UserProfile) => Promise<CoachingDecision[]>;
  acceptRecommendation: (id: string) => Promise<void>;
  dismissRecommendation: (id: string) => Promise<void>;
  clearCoaching: () => void;
}

function getWeekBounds(weeksAgo: number): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset - weeksAgo * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
}

async function getWeightAverages(userId: string, startDate: string, endDate: string): Promise<number | null> {
  const { data } = await supabase
    .from('weight_measurements')
    .select('weight_kg')
    .eq('user_id', userId)
    .gte('measured_at', startDate)
    .lte('measured_at', endDate);

  if (!data || data.length === 0) return null;
  return data.reduce((sum, m) => sum + m.weight_kg, 0) / data.length;
}

async function getWorkoutVolume(userId: string, startDate: string, endDate: string): Promise<{ count: number; volume: number }> {
  const { data: workouts } = await supabase
    .from('workouts')
    .select('id')
    .eq('user_id', userId)
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59');

  if (!workouts || workouts.length === 0) return { count: 0, volume: 0 };

  const workoutIds = workouts.map(w => w.id);
  const { data: exercises } = await supabase
    .from('workout_exercises')
    .select('id')
    .in('workout_id', workoutIds);

  if (!exercises || exercises.length === 0) return { count: workouts.length, volume: 0 };

  const exerciseIds = exercises.map(e => e.id);
  const { data: sets } = await supabase
    .from('workout_sets')
    .select('weight, reps')
    .in('exercise_id', exerciseIds);

  const totalVolume = (sets || []).reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);

  return { count: workouts.length, volume: totalVolume };
}

export const useCoachingStore = create<CoachingState>((set, get) => ({
  recommendations: [],
  loading: false,
  analyzing: false,

  fetchRecommendations: async (userId) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('coaching_recommendations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      set({ recommendations: data, loading: false });
    } else {
      set({ loading: false });
    }
  },

  runWeeklyAnalysis: async (userId, profile) => {
    set({ analyzing: true });

    const currentWeek = getWeekBounds(0);
    const prevWeek = getWeekBounds(1);
    const twoWeeksAgo = getWeekBounds(2);

    const checkinStore = useCheckinStore.getState();
    const currentMetrics = checkinStore.getWeeklyMetrics(currentWeek.start, currentWeek.end);
    const prevMetrics = checkinStore.getWeeklyMetrics(prevWeek.start, prevWeek.end);

    // Get weight data for trend analysis
    const [currentWeightAvg, prevWeightAvg, twoWeeksWeightAvg, currentWorkout, prevWorkout] = await Promise.all([
      getWeightAverages(userId, currentWeek.start, currentWeek.end),
      getWeightAverages(userId, prevWeek.start, prevWeek.end),
      getWeightAverages(userId, twoWeeksAgo.start, twoWeeksAgo.end),
      getWorkoutVolume(userId, currentWeek.start, currentWeek.end),
      getWorkoutVolume(userId, prevWeek.start, prevWeek.end),
    ]);

    // Enrich metrics with weight & workout data
    const enrichedCurrent: WeeklyMetrics = {
      ...currentMetrics,
      weightAverage: currentWeightAvg,
      weightTrend: currentWeightAvg && prevWeightAvg ? currentWeightAvg - prevWeightAvg : null,
      workoutsCompleted: currentWorkout.count,
      totalVolume: currentWorkout.volume,
    };

    const enrichedPrev: WeeklyMetrics = {
      ...prevMetrics,
      weightAverage: prevWeightAvg,
      weightTrend: prevWeightAvg && twoWeeksWeightAvg ? prevWeightAvg - twoWeeksWeightAvg : null,
      workoutsCompleted: prevWorkout.count,
      totalVolume: prevWorkout.volume,
    };

    const weightTrend = {
      currentWeekAvg: currentWeightAvg,
      previousWeekAvg: prevWeightAvg,
      twoWeeksAgoAvg: twoWeeksWeightAvg,
      weeklyChange: currentWeightAvg && prevWeightAvg ? currentWeightAvg - prevWeightAvg : null,
      twoWeekChange: currentWeightAvg && twoWeeksWeightAvg ? currentWeightAvg - twoWeeksWeightAvg : null,
    };

    // Run the coaching algorithm
    const decisions = analyzeWeeklyData(enrichedCurrent, profile, weightTrend, enrichedPrev);

    // Save recommendations to DB
    const calorieTarget = profile.daily_calorie_target || 2200;
    for (const decision of decisions) {
      const newTarget = calorieTarget + decision.calorieAdjustment;
      await supabase.from('coaching_recommendations').insert({
        user_id: userId,
        phase: decision.phase,
        decision: decision.decision,
        calorie_adjustment: decision.calorieAdjustment,
        new_calorie_target: decision.calorieAdjustment !== 0 ? newTarget : null,
        cardio_recommendation: decision.cardioRecommendation,
        training_recommendation: decision.trainingRecommendation,
        lifestyle_recommendation: decision.lifestyleRecommendation,
        reasoning: decision.reasoning,
        applied: false,
        week_start: currentWeek.start,
        week_end: currentWeek.end,
        priority: decision.priority,
        category: decision.category,
        metrics_snapshot: enrichedCurrent,
        status: 'pending',
      });
    }

    // Refresh recommendations
    await get().fetchRecommendations(userId);
    set({ analyzing: false });

    return decisions;
  },

  acceptRecommendation: async (id) => {
    const { error } = await supabase
      .from('coaching_recommendations')
      .update({ applied: true, applied_at: new Date().toISOString(), status: 'accepted' })
      .eq('id', id);

    if (!error) {
      set(state => ({
        recommendations: state.recommendations.map(r =>
          r.id === id ? { ...r, applied: true, applied_at: new Date().toISOString(), status: 'accepted' as const } : r
        ),
      }));
    }
  },

  dismissRecommendation: async (id) => {
    const { error } = await supabase
      .from('coaching_recommendations')
      .update({ status: 'dismissed' })
      .eq('id', id);

    if (!error) {
      set(state => ({
        recommendations: state.recommendations.map(r =>
          r.id === id ? { ...r, status: 'dismissed' as const } : r
        ),
      }));
    }
  },

  clearCoaching: () => set({ recommendations: [] }),
}));
