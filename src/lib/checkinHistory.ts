import type { DailyCheckin } from './types';

/** Display order: core first, then details. Never show a blank “—” for unused fields. */
export const CHECKIN_DISPLAY_SCORE_KEYS = [
  'sleep_quality',
  'energy_level',
  'stress',
  'mood',
  'hunger',
  'fatigue',
  'motivation',
  'muscle_soreness',
  'joint_pain',
  'adherence_training',
  'adherence_nutrition',
] as const;

export type CheckinDisplayScoreKey = (typeof CHECKIN_DISPLAY_SCORE_KEYS)[number];

/** @deprecated Prefer CHECKIN_DISPLAY_SCORE_KEYS + usedCheckinScores. */
export const CHECKIN_HISTORY_SCORE_KEYS = CHECKIN_DISPLAY_SCORE_KEYS;

export type CheckinHistoryScoreKey = CheckinDisplayScoreKey;

export function usedCheckinScores(row: DailyCheckin): CheckinDisplayScoreKey[] {
  return CHECKIN_DISPLAY_SCORE_KEYS.filter(key => row[key] != null);
}

export function previousCheckins(rows: DailyCheckin[], today: string): DailyCheckin[] {
  return rows
    .filter(c => c.checked_at !== today)
    .sort((a, b) => b.checked_at.localeCompare(a.checked_at) || b.created_at.localeCompare(a.created_at));
}
