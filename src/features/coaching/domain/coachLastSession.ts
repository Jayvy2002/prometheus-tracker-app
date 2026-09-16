import { liftsForClient } from './coachLifts';
import { isCompletedSet } from '../../../lib/performedSets';
import { relanceThreadHref } from './coachQueue';
import { displayName, datePrefix } from './coachText';
import { RECENT_SESSION_DAYS, trainingSessionHref } from './coachTraining';
import { addDaysToDateStr } from '../../../lib/utils';
import type {
  ClientLiftProgress,
  ClientOpsRow,
  CoachPriority,
  LastSessionExercise,
  LastSessionView,
  LiftSetSnapshot,
  SessionReviewRow,
  Workout,
} from '../../../lib/types';

export function isTodayOrYesterday(date: string, today: string): boolean {
  const day = datePrefix(date);
  return day === today || day === addDaysToDateStr(today, -1);
}

export function readableSets(sets: LiftSetSnapshot[]): LiftSetSnapshot[] {
  return sets.filter(isCompletedSet);
}

function setLine(set: LiftSetSnapshot): string {
  const load = set.set_type === 'isometric'
    ? `${set.weight_kg}kg × ${set.duration_seconds ?? 0}s`
    : `${set.weight_kg}kg × ${set.reps}`;
  const rir = set.rir > 0 ? ` @ RIR ${set.rir}` : '';
  return `${load}${rir}`;
}

export function sessionExerciseLines(session: LastSessionView): string[] {
  return session.exercises
    .map(ex => {
      const sets = readableSets(ex.sets);
      if (sets.length === 0) return '';
      const notes = ex.notes?.trim() ? ` — ${ex.notes.trim()}` : '';
      return `${ex.name}: ${sets.map(setLine).join(', ')}${notes}`;
    })
    .filter(Boolean);
}

export function sessionContextPayload(session: LastSessionView): Record<string, unknown> {
  return {
    workout_id: session.workoutId,
    date: session.date,
    name: session.name,
    exercises: session.exercises.map(ex => ({
      name: ex.name,
      notes: ex.notes?.trim() || null,
      sets: readableSets(ex.sets).map(s => ({
        weight_kg: s.weight_kg,
        reps: s.reps,
        rir: s.rir > 0 ? s.rir : null,
        completed: s.completed,
      })),
    })),
  };
}

export function lastCompletedWorkout<T extends { id: string; date: string; completed: boolean }>(
  workouts: T[],
  today?: string,
  recentDays = RECENT_SESSION_DAYS,
): T | null {
  const completed = [...workouts]
    .filter(w => w.completed)
    .sort((a, b) => datePrefix(b.date).localeCompare(datePrefix(a.date)) || b.id.localeCompare(a.id));
  const last = completed[0] ?? null;
  if (!last) return null;
  if (today) {
    const start = addDaysToDateStr(today, -recentDays);
    if (datePrefix(last.date) < start) return null;
  }
  return last;
}

function sessionViewForWorkoutId(
  clientLifts: ClientLiftProgress[],
  workoutId: string,
): LastSessionView | null {
  const exercises: LastSessionExercise[] = [];
  let date = '';
  let name = '';
  for (const lift of clientLifts) {
    const session = lift.sessions.find(s => s.workoutId === workoutId);
    if (!session) continue;
    date = session.date;
    name = session.workoutName || name;
    exercises.push({ name: lift.displayName, sets: session.sets });
  }
  if (!workoutId || exercises.length === 0) return null;
  return { workoutId, date, name, exercises };
}

function newestSessionMeta(clientLifts: ClientLiftProgress[]): { date: string; workoutId: string } | null {
  let best: { date: string; workoutId: string } | null = null;
  for (const lift of clientLifts) {
    for (const session of lift.sessions) {
      if (
        !best
        || session.date > best.date
        || (session.date === best.date && session.workoutId > best.workoutId)
      ) {
        best = { date: session.date, workoutId: session.workoutId };
      }
    }
  }
  return best;
}

/** Last completed workout from existing lift logs. Ghost / stale → empty. */
export function lastSessionFromLifts(
  lifts: ClientLiftProgress[],
  clientId: string,
  opts?: { workoutId?: string; today?: string; recentDays?: number },
): LastSessionView | null {
  const clientLifts = liftsForClient(lifts, clientId);
  if (clientLifts.length === 0) return null;

  const requested = (opts?.workoutId ?? '').trim();
  if (requested) return sessionViewForWorkoutId(clientLifts, requested);

  const newest = newestSessionMeta(clientLifts);
  if (!newest) return null;
  if (opts?.today) {
    const start = addDaysToDateStr(opts.today, -(opts.recentDays ?? RECENT_SESSION_DAYS));
    if (newest.date < start) return null;
  }
  return sessionViewForWorkoutId(clientLifts, newest.workoutId);
}

export function lastSessionFromWorkout(workout: Workout): LastSessionView {
  return {
    workoutId: workout.id,
    date: datePrefix(workout.date),
    name: workout.name || '',
    exercises: (workout.exercises ?? []).map(ex => ({
      name: ex.name,
      notes: (ex.notes || '').trim() || undefined,
      sets: (ex.sets ?? []).map(s => ({
        weight_kg: s.weight_kg,
        reps: s.reps,
        rir: s.rir,
        completed: s.completed,
        set_type: s.set_type,
        duration_seconds: s.duration_seconds,
      })),
    })),
  };
}

/** Today / yesterday only — never a fake « séance faite » from stale logs. */
export function loggedSessionForQueue(
  lifts: ClientLiftProgress[],
  clientId: string,
  today: string,
): LastSessionView | null {
  const session = lastSessionFromLifts(lifts, clientId, { today });
  if (!session) return null;
  if (!isTodayOrYesterday(session.date, today)) return null;
  return session;
}

export function sessionLoggedPriority(
  row: ClientOpsRow,
  lifts: ClientLiftProgress[],
  today: string,
): CoachPriority | null {
  const session = loggedSessionForQueue(lifts, row.client.id, today);
  if (!session) return null;
  const name = displayName(row.client);
  const when = session.date === today ? 'today' : 'yesterday';
  return {
    id: `${row.client.id}-session-logged`,
    clientId: row.client.id,
    clientName: name,
    avatarUrl: row.client.avatar_url,
    kind: 'session_logged',
    severity: 'yellow',
    headlineKey: 'coaching.priority.headlines.session_logged',
    headlineParams: { name, session: session.name || name },
    detailKey: 'coaching.priority.details.session_logged',
    detailParams: { session: session.name || '—', date: session.date, when },
    href: trainingSessionHref(row.client.id, session.workoutId),
    workoutId: session.workoutId,
  };
}

export function sessionReviewRows(
  opsRows: ClientOpsRow[],
  lifts: ClientLiftProgress[],
  today: string,
): SessionReviewRow[] {
  const rows: SessionReviewRow[] = [];
  for (const ops of opsRows) {
    const session = loggedSessionForQueue(lifts, ops.client.id, today);
    if (!session) continue;
    rows.push({
      clientId: ops.client.id,
      clientName: displayName(ops.client),
      avatarUrl: ops.client.avatar_url,
      href: trainingSessionHref(ops.client.id, session.workoutId),
      relanceHref: relanceThreadHref(ops.client.id, 'general_followup', { workoutId: session.workoutId }),
      session,
    });
  }
  return rows.sort((a, b) => b.session.date.localeCompare(a.session.date) || a.clientName.localeCompare(b.clientName));
}
