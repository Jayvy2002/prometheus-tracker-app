import { parseDecimalInput } from '../../workout/domain/workoutSetComplete';

/** `daily_checkins.sleep_hours` is numeric(3,1) CHECK (0–24). */
export const SLEEP_HOURS_MIN = 0;
export const SLEEP_HOURS_MAX = 24;

export type SleepHoursParse =
  | { ok: true; hours: number | null }
  | { ok: false; error: 'invalid' | 'range' };

/**
 * Hours of sleep as typed: « 7,5 », « 7.5 », « 7 h », « 7h30 ». Empty means not
 * answered (null, never 0). Anything else is refused with a reason, never
 * dropped silently. Stored with one decimal, like the column.
 */
export function parseSleepHours(raw: string | null | undefined): SleepHoursParse {
  const text = (raw ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (text === '') return { ok: true, hours: null };
  let hours: number;
  const hm = /^(\d{1,2})h(\d{1,2})?(?:min)?$/.exec(text);
  if (hm) {
    const minutes = hm[2] ? Number(hm[2]) : 0;
    if (minutes >= 60) return { ok: false, error: 'invalid' };
    hours = Number(hm[1]) + minutes / 60;
  } else {
    hours = parseDecimalInput(text.endsWith('h') ? text.slice(0, -1) : text);
  }
  if (!Number.isFinite(hours)) return { ok: false, error: 'invalid' };
  if (hours < SLEEP_HOURS_MIN || hours > SLEEP_HOURS_MAX) return { ok: false, error: 'range' };
  return { ok: true, hours: Math.round(hours * 10) / 10 };
}
