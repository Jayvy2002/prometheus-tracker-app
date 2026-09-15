/** Shared « why » for weekly kcal (VISION chantier A2): solo copilot + coach draft card. */

export const WEEKLY_WHY_ADJUST_REASONS = [
  'cut_stall',
  'cut_gain',
  'too_fast_cut',
  'bulk_stall',
  'bulk_too_fast',
  'carb_support',
] as const;

export type WeeklyWhyAdjustReason = (typeof WEEKLY_WHY_ADJUST_REASONS)[number];
export type WeeklyWhyAudience = 'self' | 'coach';

export interface WeeklyWhyParams {
  delta: string;
  pct: number | string;
  pctWeek: number | string;
  avg: number;
  loggedDays: number;
  window: number;
  from: number;
  to: number;
  carbs: number;
}

export function isWeeklyWhyAdjustReason(value: string): value is WeeklyWhyAdjustReason {
  return (WEEKLY_WHY_ADJUST_REASONS as readonly string[]).includes(value);
}

/**
 * One mapping: reason → i18n key.
 * Self (solo) keeps the existing `soloReview.*` voice (tutoiement).
 * Coach sees `weeklyWhy.coach.*` (le client, pas « tu »).
 */
export function weeklyNutritionWhyKey(reason: string, audience: WeeklyWhyAudience): string | null {
  if (reason === 'keep') {
    return audience === 'self' ? 'soloReview.keep' : 'weeklyWhy.coach.keep';
  }
  if (!isWeeklyWhyAdjustReason(reason)) return null;
  return audience === 'self'
    ? `soloReview.adjust.${reason}`
    : `weeklyWhy.coach.adjust.${reason}`;
}

export function parseWeeklyWhyParams(payload: unknown): WeeklyWhyParams | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  const src = row.why && typeof row.why === 'object' && !Array.isArray(row.why)
    ? row.why as Record<string, unknown>
    : null;
  if (!src) return null;
  const num = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const from = num(src.from);
  const to = num(src.to);
  const avg = num(src.avg);
  const window = num(src.window);
  if (from == null || to == null || avg == null || window == null) return null;
  return {
    delta: typeof src.delta === 'string' && src.delta.trim() ? src.delta : '—',
    pct: num(src.pct) ?? '—',
    pctWeek: typeof src.pctWeek === 'string' && src.pctWeek.trim()
      ? src.pctWeek
      : (num(src.pctWeek) ?? '—'),
    avg,
    loggedDays: num(src.loggedDays) ?? 0,
    window,
    from,
    to,
    carbs: num(src.carbs) ?? 0,
  };
}

export function parseWeeklyWhyReason(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  const reason = (payload as Record<string, unknown>).reason;
  return typeof reason === 'string' ? reason.trim() : '';
}
