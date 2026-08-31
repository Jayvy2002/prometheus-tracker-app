import { addDaysToDateStr, parseDate, toLocalDateStr } from './utils';

export interface StreakSnapshot {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
}

/**
 * Qualifying streak days (existing product rules):
 * - nutrition_logs (food, not water-only / not app-open)
 * - completed workouts
 * - weight measurements
 *
 * Check-ins, water, steps, and profile-only updates do not count.
 *
 * A live streak is the unbroken tail ending today or yesterday
 * (yesterday grace so midnight does not wipe the series before today's log).
 */
export function activityDateKey(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // DATE / midnight UTC: keep the calendar day. Parsing as Date() in America/Toronto
  // would shift 2026-08-31T00:00:00.000Z back to Aug 30.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.\d+)?(Z|[+-]00:00)?$/.test(s)) return s.slice(0, 10);
  if (s.includes('T') || s.includes('Z')) return toLocalDateStr(parseDate(s));
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function effectiveCurrentStreak(
  lastActivityDate: string | null | undefined,
  storedStreak: number,
  today: string,
): number {
  if (!Number.isFinite(storedStreak) || storedStreak <= 0) return 0;
  const last = activityDateKey(lastActivityDate);
  if (!last) return 0;
  const todayKey = activityDateKey(today) ?? today;
  const yesterday = addDaysToDateStr(todayKey, -1);
  if (last === todayKey || last === yesterday) return storedStreak;
  return 0;
}

/**
 * Apply a qualifying log date to the stored streak.
 * Returns null when nothing should be written (already counted, too old, future).
 * Dates older than yesterday do not rewind last_activity or revive a multi-day streak.
 */
export function applyQualifyingActivity(
  current: StreakSnapshot | null | undefined,
  activityDate: string,
  today: string,
): StreakSnapshot | null {
  const todayKey = activityDateKey(today) ?? today;
  const dateKey = activityDateKey(activityDate);
  if (!dateKey) return null;
  if (dateKey > todayKey) return null;

  const yesterday = addDaysToDateStr(todayKey, -1);
  if (dateKey < yesterday) return null;

  const last = activityDateKey(current?.last_activity_date ?? null);
  if (last === dateKey) return null;

  const stored = current?.current_streak ?? 0;
  const dayBeforeActivity = addDaysToDateStr(dateKey, -1);
  const newCurrent = last === dayBeforeActivity ? stored + 1 : 1;
  const longest = Math.max(newCurrent, current?.longest_streak ?? 0);

  return {
    current_streak: newCurrent,
    longest_streak: longest,
    last_activity_date: dateKey,
  };
}

/** Consecutive qualifying days ending today, or yesterday if today is still empty. */
export function countUnbrokenStreak(
  dates: Iterable<string>,
  today: string,
  maxDays = 365,
): number {
  const set = new Set<string>();
  for (const raw of dates) {
    const key = activityDateKey(raw);
    if (key) set.add(key);
  }
  const todayKey = activityDateKey(today) ?? today;
  let cursor = todayKey;
  if (!set.has(todayKey)) {
    cursor = addDaysToDateStr(todayKey, -1);
  }
  if (!set.has(cursor)) return 0;
  let count = 0;
  for (let i = 0; i < maxDays; i++) {
    if (!set.has(cursor)) break;
    count++;
    cursor = addDaysToDateStr(cursor, -1);
  }
  return count;
}
