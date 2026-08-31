/** Client home first-run + missing-data guards. Never invent 999 days or a fake kcal deficit. */

const EPOCH_MS = Date.parse('1970-01-01T00:00:00.000Z');
const MIN_SANE_YEAR = 2015;
const MAX_SANE_DAYS = 4000;

export type ClientHomeNextActionKind = 'waiting_program' | 'first_session';

export interface ClientHomeActivity {
  completedWorkoutCount: number;
  nutritionLogCount: number;
  checkinCount: number;
  lastWorkoutAt?: string | null;
  lastNutritionAt?: string | null;
  lastCheckinAt?: string | null;
}

export function parseActivityTime(value: string | null | undefined): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw === '0' || raw.startsWith('0000')) return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  if (t <= EPOCH_MS) return null;
  if (new Date(t).getUTCFullYear() < MIN_SANE_YEAR) return null;
  return t;
}

/** Calendar days since a timestamp. Missing / epoch-zero / garbage → null (never 999). */
export function daysSinceActivity(value: string | null | undefined, now: Date = new Date()): number | null {
  const t = parseActivityTime(value);
  if (t === null) return null;
  const days = Math.floor((now.getTime() - t) / 86_400_000);
  if (days < 0) return 0;
  if (days > MAX_SANE_DAYS) return null;
  return days;
}

export function shouldShowDaysSinceReminder(days: number | null, minDays = 3): boolean {
  return days !== null && days >= minDays;
}

/**
 * % vs calorie target. Negative = below.
 * No logs, or 0 consumed, is missing data — not a 71%/100% deficit.
 */
export function calorieGapPct(consumed: number, target: number, hasLogs: boolean): number | null {
  if (!hasLogs) return null;
  if (!Number.isFinite(consumed) || !Number.isFinite(target)) return null;
  if (consumed <= 0 || target <= 0) return null;
  return Math.round(((consumed - target) / target) * 100);
}

export type CalorieGapKind = 'on_target' | 'above' | 'below';

export function calorieGapKind(pct: number | null, onTargetBand = 5): CalorieGapKind | null {
  if (pct === null) return null;
  if (Math.abs(pct) <= onTargetBand) return 'on_target';
  return pct > 0 ? 'above' : 'below';
}

/** Average kcal only on days that actually have food — water-only zeros must not invent a deficit. */
export function averageLoggedCalories(days: Array<{ calories: number }>): { avg: number; hasLogs: boolean } {
  const logged = days.filter(d => Number.isFinite(d.calories) && d.calories > 0);
  if (logged.length === 0) return { avg: 0, hasLogs: false };
  const avg = Math.round(logged.reduce((sum, d) => sum + d.calories, 0) / logged.length);
  return { avg, hasLogs: true };
}

export function statsCalorieSummary(input: {
  days: Array<{ calories: number }>;
  calorieTarget: number;
}): { kind: CalorieGapKind; pct: number } | null {
  const { avg, hasLogs } = averageLoggedCalories(input.days);
  const pct = calorieGapPct(avg, input.calorieTarget, hasLogs);
  const kind = calorieGapKind(pct);
  if (kind === null || pct === null) return null;
  return { kind, pct: Math.abs(pct) };
}

export function isClientFirstRun(activity: ClientHomeActivity): boolean {
  if (activity.completedWorkoutCount > 0) return false;
  if (activity.nutritionLogCount > 0) return false;
  if (activity.checkinCount > 0) return false;
  const last = [
    parseActivityTime(activity.lastWorkoutAt ?? null),
    parseActivityTime(activity.lastNutritionAt ?? null),
    parseActivityTime(activity.lastCheckinAt ?? null),
  ].filter((n): n is number => n !== null);
  return last.length === 0;
}

export function clientHomeNextAction(input: {
  firstRun: boolean;
  hasProgram: boolean;
  hasNextWorkout: boolean;
  hasCoach: boolean;
}): ClientHomeNextActionKind | null {
  if (input.hasNextWorkout) return null;
  if (!input.firstRun) return null;
  if (input.hasCoach && !input.hasProgram) return 'waiting_program';
  return 'first_session';
}
