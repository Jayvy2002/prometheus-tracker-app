import { supabase } from '../../../lib/supabase';
import type { AthleteWeeklyReview } from '../types';
import { weeklyReviewSaveArgs, type WeeklyReviewResult } from './weeklyReview';

/** Writes go through SECURITY DEFINER RPC. Direct table inserts are revoked. */
export async function saveAthleteWeeklyReview(input: {
  athleteId: string;
  review: WeeklyReviewResult;
}) {
  return supabase.rpc('save_athlete_weekly_review', weeklyReviewSaveArgs(input.athleteId, input.review));
}

export async function listLatestAthleteWeeklyReviewBestEffort(
  athleteId: string,
): Promise<AthleteWeeklyReview | null> {
  const { data, error } = await supabase
    .from('athlete_weekly_reviews')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('week_start', { ascending: false })
    .limit(1);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return data[0] as AthleteWeeklyReview;
}
