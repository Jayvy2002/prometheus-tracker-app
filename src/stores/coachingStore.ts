import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { CoachingRecommendation, UserProfile, WeeklyMetrics } from '../lib/types';
import { analyzeWeeklyData, CoachingDecision } from '../lib/coachingEngine';
import { useCheckinStore } from './checkinStore';
import { useProfileStore } from './profileStore';

interface CoachingState {
  recommendations: CoachingRecommendation[];
  loading: boolean;
  analyzing: boolean;
  lastAnalysisDate: string | null;

  fetchRecommendations: (userId: string) => Promise<void>;
  runWeeklyAnalysis: (userId: string, profile: UserProfile) => Promise<CoachingDecision[]>;
  maybeAutoAnalyze: (userId: string, profile: UserProfile) => Promise<void>;
  acceptRecommendation: (id: string, userId: string) => Promise<void>;
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
  lastAnalysisDate: null,

  fetchRecommendations: async (userId) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('coaching_recommendations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      const lastDate = data.length > 0 ? data[0].created_at?.split('T')[0] : null;
      set({ recommendations: data, loading: false, lastAnalysisDate: lastDate });
    } else {
      set({ loading: false });
    }
  },

  maybeAutoAnalyze: async (userId, profile) => {
    const { lastAnalysisDate, analyzing } = get();
    if (analyzing) return;

    const today = new Date().toISOString().split('T')[0];
    const dayOfWeek = new Date().getDay();

    // Auto-analyze on Mondays (day 1) or if never analyzed
    if (dayOfWeek !== 1 && lastAnalysisDate) return;
    if (lastAnalysisDate === today) return;

    // Check if we have enough check-in data
    const checkinStore = useCheckinStore.getState();
    const currentWeek = getWeekBounds(1); // Analyze previous week
    const weekCheckins = checkinStore.checkins.filter(
      c => c.checked_at >= currentWeek.start && c.checked_at <= currentWeek.end
    );

    if (weekCheckins.length >= 4) {
      await get().runWeeklyAnalysis(userId, profile);
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

    const [currentWeightAvg, prevWeightAvg, twoWeeksWeightAvg, currentWorkout, prevWorkout] = await Promise.all([
      getWeightAverages(userId, currentWeek.start, currentWeek.end),
      getWeightAverages(userId, prevWeek.start, prevWeek.end),
      getWeightAverages(userId, twoWeeksAgo.start, twoWeeksAgo.end),
      getWorkoutVolume(userId, currentWeek.start, currentWeek.end),
      getWorkoutVolume(userId, prevWeek.start, prevWeek.end),
    ]);

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

    const decisions = analyzeWeeklyData(enrichedCurrent, profile, weightTrend, enrichedPrev);

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

    await get().fetchRecommendations(userId);
    set({ analyzing: false, lastAnalysisDate: new Date().toISOString().split('T')[0] });

    return decisions;
  },

  acceptRecommendation: async (id, userId) => {
    const rec = get().recommendations.find(r => r.id === id);
    if (!rec) return;

    const { error } = await supabase
      .from('coaching_recommendations')
      .update({ applied: true, applied_at: new Date().toISOString(), status: 'accepted' })
      .eq('id', id);

    if (!error) {
      // Auto-apply calorie/macro adjustments to profile
      if (rec.calorie_adjustment !== 0 && rec.new_calorie_target) {
        const profileStore = useProfileStore.getState();
        const currentProfile = profileStore.profile;
        if (currentProfile) {
          const newCalories = rec.new_calorie_target;
          const weightKg = currentProfile.weight_kg || 75;

          // Recalculate macros per SOP Phase 4: Protein (2g/kg) > Lipids (0.9g/kg) > Carbs (remaining)
          const proteinGrams = Math.round(weightKg * 2.0);
          const fatGrams = Math.round(weightKg * 0.9);
          const proteinCals = proteinGrams * 4;
          const fatCals = fatGrams * 9;
          const carbsCals = Math.max(0, newCalories - proteinCals - fatCals);
          const carbsGrams = Math.round(carbsCals / 4);

          await profileStore.updateProfile(userId, {
            daily_calorie_target: newCalories,
            protein_target: proteinGrams,
            fat_target: fatGrams,
            carbs_target: carbsGrams,
          });
        }
      }

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

  clearCoaching: () => set({ recommendations: [], lastAnalysisDate: null }),
}));
