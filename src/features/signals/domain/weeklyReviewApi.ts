import { supabase } from '../../../lib/supabase';
import { weeklyReviewSaveArgs, type WeeklyReviewResult } from './weeklyReview';

/** Writes go through SECURITY DEFINER RPC. Direct table inserts are revoked. */
export async function saveAthleteWeeklyReview(input: {
  athleteId: string;
  review: WeeklyReviewResult;
}) {
  return supabase.rpc('save_athlete_weekly_review', weeklyReviewSaveArgs(input.athleteId, input.review));
}
