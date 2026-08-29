import { findLift, liftsForClient } from './coachLifts';
import { sparklineValues } from './coachProgress';
import { foldText, namesMatch } from './coachText';
import { addDaysToDateStr } from './utils';
import type { ClientLiftProgress } from './types';

export const TRAINING_TAB = 'training';

export function trainingFocusHref(clientId: string, exerciseName?: string | null): string {
  const params = new URLSearchParams({ tab: TRAINING_TAB });
  const name = (exerciseName ?? '').trim();
  if (name) params.set('exercise', name);
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

export function lastSessionDate(lift: ClientLiftProgress): string {
  return lift.sessions[0]?.date ?? '';
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
  return /\bbench\b/.test(folded)
    || folded.includes('developpe couche')
    || folded.includes('developpe');
}

function isBenchLift(lift: ClientLiftProgress): boolean {
  return lift.exerciseName.includes('bench') || lift.exerciseName.includes('developpe');
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
  },
): ClientLiftProgress | null {
  if (lifts.length === 0) return null;

  const hint = opts?.hint?.trim();
  if (hint) {
    const fromHint = matchLoggedLift(lifts, hint);
    if (fromHint) return fromHint;
  }

  const fromNote = prLiftFromNotes(lifts, opts?.notes ?? []);
  if (fromNote) return fromNote;

  const recentPr = loggedExerciseOptions(lifts.filter(hasRecentPr))[0];
  if (recentPr) return recentPr;

  for (const name of opts?.prescribedNames ?? []) {
    const fromPrescribed = matchLoggedLift(lifts, name);
    if (fromPrescribed) return fromPrescribed;
  }

  return loggedExerciseOptions(lifts)[0] ?? null;
}

export function defaultLiftForClient(
  lifts: ClientLiftProgress[],
  clientId: string,
  opts?: {
    hint?: string;
    notes?: Array<{ body: string }>;
    prescribedNames?: string[];
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
