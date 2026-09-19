import { supabase } from '../../../lib/supabase';
import type { AthleteWeeklyReview } from '../types';
import { weeklyReviewSaveArgs, type WeeklyReviewResult } from './weeklyReview';
import type { WatchQueryResult } from './watchQuery';

/** Writes go through SECURITY DEFINER RPC. Direct table inserts are revoked. */
export async function saveAthleteWeeklyReview(input: {
  athleteId: string;
  review: WeeklyReviewResult;
}) {
  return supabase.rpc('save_athlete_weekly_review', weeklyReviewSaveArgs(input.athleteId, input.review));
}

export async function listLatestAthleteWeeklyReviewForWatch(
  athleteId: string,
): Promise<WatchQueryResult<AthleteWeeklyReview | null>> {
  const { data, error } = await supabase
    .from('athlete_weekly_reviews')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('week_start', { ascending: false })
    .limit(1);
  if (error) return { ok: false, message: error.message };
  if (!Array.isArray(data) || data.length === 0) return { ok: true, data: null };
  return { ok: true, data: data[0] as AthleteWeeklyReview };
}

export async function listLatestAthleteWeeklyReviewBestEffort(
  athleteId: string,
): Promise<AthleteWeeklyReview | null> {
  const result = await listLatestAthleteWeeklyReviewForWatch(athleteId);
  return result.ok ? result.data : null;
}
