import { datePrefix, foldText } from './coachText';
import { isPerformedSet } from '../../../lib/performedSets';
import type { ClientLiftProgress, LiftSessionSnapshot, LiftSetSnapshot } from '../../../lib/types';

export interface RawWorkoutRow {
  id: string;
  user_id: string;
  date: string;
  name: string;
  completed: boolean;
}

export interface RawExerciseRow {
  id: string;
  workout_id: string;
  name: string;
}

export interface RawSetRow {
  exercise_id: string;
  weight_kg: number;
  reps: number;
  rir: number;
  completed: boolean;
  set_type?: string;
}

function sessionFromSets(
  workout: RawWorkoutRow,
  name: string,
  sets: LiftSetSnapshot[],
): LiftSessionSnapshot | null {
  const pool = sets.filter(isPerformedSet);
  if (pool.length === 0) return null;
  const loaded = pool.filter(s => s.weight_kg > 0);
  const maxWeight = loaded.length > 0 ? Math.max(...loaded.map(s => s.weight_kg)) : 0;
  const best = (loaded.length > 0 ? loaded : pool).reduce((a, b) => (
    b.weight_kg > a.weight_kg || (b.weight_kg === a.weight_kg && b.reps > a.reps) ? b : a
  ));
  const rirs = pool.map(s => s.rir).filter(r => r > 0);
  return {
    date: datePrefix(workout.date),
    workoutId: workout.id,
    workoutName: workout.name || name,
    maxWeight,
    bestSet: best.weight_kg > 0 || best.reps > 0
      ? `${best.weight_kg}kg × ${best.reps}`
      : `${best.duration_seconds ?? 0}s`,
    avgRir: rirs.length ? Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10 : null,
    volume: pool.reduce((s, x) => s + x.weight_kg * x.reps, 0),
    sets,
  };
}

export function isLiftStalled(sessions: LiftSessionSnapshot[]): boolean {
  const recent = [...sessions].sort((a, b) => a.date.localeCompare(b.date)).slice(-3);
  if (recent.length < 3) return false;
  const span = (Date.parse(recent[recent.length - 1].date) - Date.parse(recent[0].date)) / 86400000;
  if (span < 10) return false;
  const first = recent[0].maxWeight;
  const last = recent[recent.length - 1].maxWeight;
  if (last > first + 0.5) return false;
  const rirs = recent.map(s => s.avgRir).filter((r): r is number => r != null);
  if (rirs.length >= 2 && rirs[rirs.length - 1] < rirs[0] - 0.5) return false;
  return last <= first;
}

export function progressedLifts(lifts: ClientLiftProgress[]): string[] {
  return lifts.filter(l => {
    const recent = [...l.sessions].sort((a, b) => a.date.localeCompare(b.date)).slice(-3);
    if (recent.length < 2) return false;
    return recent[recent.length - 1].maxWeight > recent[0].maxWeight + 0.5;
  }).map(l => l.displayName);
}

export function stalledLifts(lifts: ClientLiftProgress[]): ClientLiftProgress[] {
  return lifts.filter(l => l.stalled);
}

export function buildClientLifts(
  workouts: RawWorkoutRow[],
  exercises: RawExerciseRow[],
  sets: RawSetRow[],
): ClientLiftProgress[] {
  const workoutById = new Map(workouts.filter(w => w.completed).map(w => [w.id, w]));
  const setsByEx = new Map<string, LiftSetSnapshot[]>();
  for (const s of sets) {
    const list = setsByEx.get(s.exercise_id) ?? [];
    list.push({
      weight_kg: s.weight_kg,
      reps: s.reps,
      rir: s.rir,
      completed: s.completed,
      set_type: s.set_type,
    });
    setsByEx.set(s.exercise_id, list);
  }

  const grouped = new Map<string, { displayName: string; clientId: string; sessions: LiftSessionSnapshot[] }>();
  for (const ex of exercises) {
    const workout = workoutById.get(ex.workout_id);
    if (!workout) continue;
    const session = sessionFromSets(workout, ex.name, setsByEx.get(ex.id) ?? []);
    if (!session) continue;
    const key = `${workout.user_id}::${foldText(ex.name)}`;
    const row = grouped.get(key) ?? { displayName: ex.name, clientId: workout.user_id, sessions: [] };
    row.sessions.push(session);
    grouped.set(key, row);
  }

  return [...grouped.values()].map(row => {
    const sessions = row.sessions.sort((a, b) => b.date.localeCompare(a.date));
    return {
      clientId: row.clientId,
      exerciseName: foldText(row.displayName),
      displayName: row.displayName,
      sessions,
      stalled: isLiftStalled(sessions),
    };
  });
}

export function liftsForClient(lifts: ClientLiftProgress[], clientId: string): ClientLiftProgress[] {
  return lifts.filter(l => l.clientId === clientId);
}

export function findLift(
  lifts: ClientLiftProgress[],
  clientId: string,
  hint: string,
): ClientLiftProgress | null {
  const clientLifts = liftsForClient(lifts, clientId);
  const folded = foldText(hint);
  return clientLifts.find(l => l.exerciseName === folded || l.exerciseName.includes(folded) || folded.includes(l.exerciseName))
    ?? clientLifts.find(l => foldText(l.displayName).includes(folded))
    ?? null;
}
