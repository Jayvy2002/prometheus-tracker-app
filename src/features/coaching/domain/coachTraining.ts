import { findLift, liftsForClient } from './coachLifts';
import { sparklineValues } from './coachProgress';
import { foldText, namesMatch } from './coachText';
import { addDaysToDateStr } from '../../../lib/utils';
import type { ClientLiftProgress } from '../../../lib/types';

export const TRAINING_TAB = 'training';
export const WORKOUT_QUERY_PARAM = 'workout';

export function trainingFocusHref(clientId: string, exerciseName?: string | null): string {
  const params = new URLSearchParams({ tab: TRAINING_TAB });
  const name = (exerciseName ?? '').trim();
  if (name) params.set('exercise', name);
  return `/clients/${clientId}?${params.toString()}`;
}

export function trainingSessionHref(clientId: string, workoutId: string): string {
  const params = new URLSearchParams({ tab: TRAINING_TAB });
  const id = parseWorkoutQuery(workoutId);
  if (id) params.set(WORKOUT_QUERY_PARAM, id);
  return `/clients/${clientId}?${params.toString()}`;
}

export function isTrainingHref(href: string): boolean {
  const query = href.split('?')[1];
  if (!query) return false;
  return new URLSearchParams(query).get('tab') === TRAINING_TAB;
}

export function parseExerciseQuery(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function parseWorkoutQuery(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed.length > 80 || /\s/.test(trimmed)) return '';
  return trimmed;
}

export function workoutIdFromHref(href: string): string | null {
  const query = href.split('?')[1];
  if (!query) return null;
  const id = parseWorkoutQuery(new URLSearchParams(query).get(WORKOUT_QUERY_PARAM));
  return id || null;
}

export function lastSessionDate(lift: ClientLiftProgress): string {
  return lift.sessions[0]?.date ?? '';
}

/** Ghost / missed-week: no log in this window → empty + Relancer, not a stale dump. */
export const RECENT_SESSION_DAYS = 14;

export function recentLoggedLifts(
  lifts: ClientLiftProgress[],
  today: string,
  days = RECENT_SESSION_DAYS,
): ClientLiftProgress[] {
  const start = addDaysToDateStr(today, -days);
  return lifts.filter(l => lastSessionDate(l) >= start);
}

export function loggedExerciseOptions(lifts: ClientLiftProgress[]): ClientLiftProgress[] {
  return [...lifts].sort((a, b) => lastSessionDate(b).localeCompare(lastSessionDate(a)));
}

/** Latest logged top set is heavier than every previous session. Honest PR from sets, not e1RM. */
export function hasRecentPr(lift: ClientLiftProgress): boolean {
  if (lift.sessions.length < 2) return false;
  const newest = lift.sessions[0];
  const previousMax = Math.max(...lift.sessions.slice(1).map(s => s.maxWeight));
  return newest.maxWeight > previousMax + 0.5;
}

function isBenchHint(folded: string): boolean {
  return /\bbench\b/.test(folded) || folded.includes('developpe couche');
}

function isBenchLift(lift: ClientLiftProgress): boolean {
  return lift.exerciseName.includes('bench')
    || lift.exerciseName === 'developpe couche'
    || lift.exerciseName.startsWith('developpe couche ');
}

export function liftMatchesQuery(lift: ClientLiftProgress, query: string): boolean {
  const q = foldText(query);
  if (!q) return false;
  if (
    lift.exerciseName === q
    || lift.exerciseName.includes(q)
    || q.includes(lift.exerciseName)
    || namesMatch(lift.displayName, query)
  ) return true;
  return isBenchHint(q) && isBenchLift(lift);
}

export function matchLoggedLift(lifts: ClientLiftProgress[], hint: string): ClientLiftProgress | null {
  const trimmed = hint.trim();
  if (!trimmed || lifts.length === 0) return null;
  const clientId = lifts[0].clientId;
  return findLift(lifts, clientId, trimmed)
    ?? lifts.find(l => liftMatchesQuery(l, trimmed))
    ?? null;
}

const PR_NOTE_RE = /\bpr\b|\brecord\b/;

export function prLiftFromNotes(
  lifts: ClientLiftProgress[],
  notes: Array<{ body: string }>,
): ClientLiftProgress | null {
  if (lifts.length === 0) return null;
  for (const note of notes) {
    const folded = foldText(note.body);
    if (!PR_NOTE_RE.test(folded)) continue;
    const matched = matchLoggedLift(lifts, note.body);
    if (matched) return matched;
  }
  return null;
}

export function pickDefaultLift(
  lifts: ClientLiftProgress[],
  opts?: {
    hint?: string;
    notes?: Array<{ body: string }>;
    prescribedNames?: string[];
    today?: string;
    recentDays?: number;
  },
): ClientLiftProgress | null {
  const pool = opts?.today
    ? recentLoggedLifts(lifts, opts.today, opts.recentDays)
    : lifts;
  if (pool.length === 0) return null;

  const hint = opts?.hint?.trim();
  if (hint) {
    const fromHint = matchLoggedLift(pool, hint) ?? matchLoggedLift(lifts, hint);
    if (fromHint) return fromHint;
  }

  const fromNote = prLiftFromNotes(pool, opts?.notes ?? []);
  if (fromNote) return fromNote;

  const recentPr = loggedExerciseOptions(pool.filter(hasRecentPr))[0];
  if (recentPr) return recentPr;

  for (const name of opts?.prescribedNames ?? []) {
    const fromPrescribed = matchLoggedLift(pool, name);
    if (fromPrescribed) return fromPrescribed;
  }

  return loggedExerciseOptions(pool)[0] ?? null;
}

export function defaultLiftForClient(
  lifts: ClientLiftProgress[],
  clientId: string,
  opts?: {
    hint?: string;
    notes?: Array<{ body: string }>;
    prescribedNames?: string[];
    today?: string;
    recentDays?: number;
  },
): ClientLiftProgress | null {
  return pickDefaultLift(liftsForClient(lifts, clientId), opts);
}

export type LiftChartKind = 'empty' | 'single' | 'curve';

export function liftChartKind(lift: ClientLiftProgress | null): LiftChartKind {
  if (!lift || lift.sessions.length === 0) return 'empty';
  if (lift.sessions.length === 1) return 'single';
  return 'curve';
}

/**
 * Lift that actually moved this week (top set up). Skip when logs are thin.
 */
export function weekMovedLift(
  lifts: ClientLiftProgress[],
  today: string,
): ClientLiftProgress | null {
  const weekStart = addDaysToDateStr(today, -7);
  let best: { lift: ClientLiftProgress; delta: number } | null = null;
  for (const lift of lifts) {
    const chronological = [...lift.sessions].sort((a, b) => a.date.localeCompare(b.date));
    if (chronological.length < 2) continue;
    if (sparklineValues(lift, 'topSet').length < 2) continue;
    const last = chronological[chronological.length - 1];
    const prev = chronological[chronological.length - 2];
    if (!last || !prev) continue;
    if (last.date < weekStart) continue;
    const delta = last.maxWeight - prev.maxWeight;
    if (delta <= 0.5) continue;
    if (!best || delta > best.delta) best = { lift, delta };
  }
  return best?.lift ?? null;
}
