import { supabase } from '../../../lib/supabase';
import type { WeeklyReviewResult } from './weeklyReview';
import { weeklyReviewActionsToRpcPayload } from './weeklyReview';

/** Writes go through SECURITY DEFINER RPC. Direct table inserts are revoked. */
export async function saveAthleteWeeklyReview(input: {
  athleteId: string;
  review: WeeklyReviewResult;
}) {
  return supabase.rpc('save_athlete_weekly_review', {
    p_athlete_id: input.athleteId,
    p_week_start: input.review.weekStart,
    p_data_quality: input.review.dataQuality,
    p_decision: input.review.decision,
    p_summary: input.review.summary,
    p_aggregates: {
      window_start: input.review.aggregates.windowStart,
      window_end: input.review.aggregates.windowEnd,
      logged_nutrition_days: input.review.aggregates.loggedNutritionDays,
      avg_calories: input.review.aggregates.avgCalories,
      calorie_target: input.review.aggregates.calorieTarget,
      workout_count: input.review.aggregates.workoutCount,
      expected_workouts: input.review.aggregates.expectedWorkouts,
      weigh_ins: input.review.aggregates.weighIns,
      weight_delta_kg: input.review.aggregates.weightDeltaKg,
      checkin_count: input.review.aggregates.checkinCount,
      goal: input.review.aggregates.goal,
    },
    p_tracking: input.review.tracking,
    p_signal_actions: weeklyReviewActionsToRpcPayload(input.review.signalActions),
  });
}
