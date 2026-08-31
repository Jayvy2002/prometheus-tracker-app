import type { DailyCheckin } from './types';

/** New client check-in ratings are 0–10 inclusive. */
export const CHECKIN_SCORE_MIN = 0;
export const CHECKIN_SCORE_MAX = 10;
/** Historical rows were stored as integers 1–5. Never rewrite those values. */
export const CHECKIN_SCORE_LEGACY_MAX = 5;

export const CHECKIN_SCORE_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** ~3/5 on the old scale. */
export const PAIN_WATCH_ON_TEN = 6;
/** ~4/5 on the old scale. */
export const PAIN_CONCERN_ON_TEN = 8;
/** ~2/5 on the old scale. */
export const LOW_SLEEP_QUALITY_ON_TEN = 4;
export const RECOVERY_CONCERN_ON_TEN = 4;
export const RECOVERY_WATCH_ON_TEN = 6;

export const CHECKIN_RATING_KEYS = [
  'hunger',
  'fatigue',
  'sleep_quality',
  'stress',
  'motivation',
  'muscle_soreness',
  'joint_pain',
  'energy_level',
  'mood',
] as const;

export type CheckinRatingKey = typeof CHECKIN_RATING_KEYS[number];
export type CheckinRatings = Pick<DailyCheckin, CheckinRatingKey>;

export function clampCheckinScore(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  if (n < CHECKIN_SCORE_MIN || n > CHECKIN_SCORE_MAX) return null;
  return n;
}

export function isLegacyFiveScaleRow(scores: Array<number | null | undefined>): boolean {
  const nums = scores.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return false;
  return nums.every(v => v >= 1 && v <= CHECKIN_SCORE_LEGACY_MAX);
}

export function ratingValuesFromCheckin(c: CheckinRatings): Array<number | null> {
  return CHECKIN_RATING_KEYS.map(k => c[k]);
}

export function isLegacyFiveScaleCheckin(c: CheckinRatings): boolean {
  return isLegacyFiveScaleRow(ratingValuesFromCheckin(c));
}

/**
 * Map a stored rating onto 0–10 for averages and flags.
 * Legacy 1–5 is ×2 (3/5 → 6/10). Stored integers are never rewritten.
 */
export function scoreOnTen(value: number | null | undefined, legacyFive: boolean): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const v = legacyFive ? value * 2 : value;
  const clamped = Math.min(CHECKIN_SCORE_MAX, Math.max(CHECKIN_SCORE_MIN, v));
  return Math.round(clamped * 10) / 10;
}

export function invertScoreOnTen(value: number | null | undefined, legacyFive: boolean): number | null {
  const n = scoreOnTen(value, legacyFive);
  if (n == null) return null;
  return Math.round((CHECKIN_SCORE_MAX - n) * 10) / 10;
}

/**
 * Display a stored rating.
 * - 0 or 6–10 (or a mixed new-scale row) → n/10
 * - historical 1–5-only rows → the number as stored, no /5 (and no fake /10)
 * - values > 10 (adherence 0–100) → the number, no rating denominator
 */
export function formatCheckinScore(
  value: number | null | undefined,
  row?: CheckinRatings | null,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const n = Math.round(value * 10) / 10;
  const shown = String(n);
  if (value > CHECKIN_SCORE_MAX) return shown;
  if (value === 0 || value > CHECKIN_SCORE_LEGACY_MAX) return `${shown}/${CHECKIN_SCORE_MAX}`;
  if (row && !isLegacyFiveScaleCheckin(row)) return `${shown}/${CHECKIN_SCORE_MAX}`;
  return shown;
}
