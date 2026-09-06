import type { DailyCheckin } from './types';

export const CHECKIN_HISTORY_SCORE_KEYS = [
  'energy_level',
  'mood',
  'stress',
  'hunger',
  'sleep_quality',
] as const;

export type CheckinHistoryScoreKey = (typeof CHECKIN_HISTORY_SCORE_KEYS)[number];

export function previousCheckins(rows: DailyCheckin[], today: string): DailyCheckin[] {
  return rows
    .filter(c => c.checked_at !== today)
    .sort((a, b) => b.checked_at.localeCompare(a.checked_at) || b.created_at.localeCompare(a.created_at));
}
