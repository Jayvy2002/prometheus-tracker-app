export function epley1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return Math.round(weight);
  return Math.round(weight * (1 + reps / 30));
}

export function isCompletedSet(set: { completed?: boolean | null }): boolean {
  return set.completed === true;
}

export function isWarmupSet(set: { set_type?: string | null }): boolean {
  return set.set_type === 'warmup';
}

/** Realized working set: checked by the athlete, not a warm-up. */
export function isPerformedSet(set: {
  completed?: boolean | null;
  set_type?: string | null;
}): boolean {
  return isCompletedSet(set) && !isWarmupSet(set);
}

export function performedSets<T extends { completed?: boolean | null; set_type?: string | null }>(
  sets: T[] | null | undefined,
): T[] {
  return (sets ?? []).filter(isPerformedSet);
}

export function setVolumeKg(set: { weight_kg?: number | null; reps?: number | null }): number {
  return (set.weight_kg ?? 0) * (set.reps ?? 0);
}

export function isBeatenRecord(current: number, previousMax: number): boolean {
  return current > previousMax;
}

export interface WorkoutSummaryStats {
  duration: number;
  totalVolume: number;
  exerciseCount: number;
  setCount: number;
  skippedSetCount: number;
  topExercises: { name: string; volume: number; estimated1RM: number }[];
}

export function computeWorkoutSummaryStats(
  workout: {
    exercises?: Array<{
      name: string;
      sets?: Array<{
        completed?: boolean | null;
        set_type?: string | null;
        weight_kg?: number | null;
        reps?: number | null;
      }> | null;
    }> | null;
  },
  duration: number,
): WorkoutSummaryStats {
  let totalVolume = 0;
  let setCount = 0;
  let skippedSetCount = 0;
  const exerciseStats: { name: string; volume: number; estimated1RM: number }[] = [];

  for (const ex of workout.exercises ?? []) {
    let exVolume = 0;
    let max1RM = 0;
    let performedHere = 0;
    for (const s of ex.sets ?? []) {
      if (isWarmupSet(s)) continue;
      if (!isCompletedSet(s)) {
        skippedSetCount++;
        continue;
      }
      const vol = setVolumeKg(s);
      exVolume += vol;
      totalVolume += vol;
      setCount++;
      performedHere++;
      max1RM = Math.max(max1RM, epley1RM(s.weight_kg ?? 0, s.reps ?? 0));
    }
    if (performedHere > 0) {
      exerciseStats.push({ name: ex.name, volume: exVolume, estimated1RM: max1RM });
    }
  }

  exerciseStats.sort((a, b) => b.volume - a.volume);

  return {
    duration,
    totalVolume,
    exerciseCount: exerciseStats.length,
    setCount,
    skippedSetCount,
    topExercises: exerciseStats.slice(0, 3),
  };
}

export interface ExerciseProgressEntry {
  date: string;
  workoutId: string | null;
  maxWeight: number;
  totalVolume: number;
  estimated1RM: number;
  sets: number;
}

const WORKOUT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function workoutOriginId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!WORKOUT_ID_RE.test(trimmed)) return null;
  return trimmed;
}

export function progressSessionHref(workoutId: string | null | undefined): string | null {
  const id = workoutOriginId(workoutId);
  return id ? `/workout/${id}` : null;
}

export interface ExerciseProgressSummary {
  name: string;
  entries: ExerciseProgressEntry[];
  latest1RM: number;
  best1RM: number;
  trend: number;
  totalSessions: number;
}

export function aggregateExerciseProgress(
  rows: Array<{
    name: string;
    workout_sets: Array<{
      weight_kg: number;
      reps: number;
      set_type: string;
      completed: boolean;
    }>;
    workouts: { id?: string | null; date: string };
  }>,
  dateKey: (iso: string) => string,
): ExerciseProgressSummary[] {
  const byExercise: Record<string, Record<string, {
    date: string;
    workoutId: string | null;
    maxWeight: number;
    totalVolume: number;
    best1RM: number;
    sets: number;
  }>> = {};

  for (const ex of rows) {
    const name = ex.name;
    if (!byExercise[name]) byExercise[name] = {};
    const date = dateKey(ex.workouts.date);
    const workoutId = workoutOriginId(ex.workouts.id);
    const key = workoutId ?? `date:${date}`;
    if (!byExercise[name][key]) {
      byExercise[name][key] = { date, workoutId, maxWeight: 0, totalVolume: 0, best1RM: 0, sets: 0 };
    }
    const bucket = byExercise[name][key];
    for (const s of ex.workout_sets ?? []) {
      if (!isPerformedSet(s)) continue;
      const w = s.weight_kg || 0;
      const r = s.reps || 0;
      bucket.sets++;
      bucket.totalVolume += w * r;
      if (w > 0) bucket.maxWeight = Math.max(bucket.maxWeight, w);
      bucket.best1RM = Math.max(bucket.best1RM, epley1RM(w, r));
    }
  }

  return Object.entries(byExercise)
    .map(([name, buckets]) => {
      const entries: ExerciseProgressEntry[] = Object.values(buckets)
        .filter(d => d.sets > 0)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.workoutId ?? '').localeCompare(b.workoutId ?? ''))
        .map(d => ({
          date: d.date,
          workoutId: d.workoutId,
          maxWeight: Math.round(d.maxWeight * 10) / 10,
          totalVolume: Math.round(d.totalVolume),
          estimated1RM: d.best1RM,
          sets: d.sets,
        }));
      if (entries.length === 0) {
        return null;
      }
      const latest1RM = entries[entries.length - 1].estimated1RM;
      const best1RM = Math.max(...entries.map(e => e.estimated1RM));
      const prev1RM = entries.length >= 2 ? entries[entries.length - 2].estimated1RM : latest1RM;
      const trend = prev1RM > 0 ? Math.round(((latest1RM - prev1RM) / prev1RM) * 100) : 0;
      return {
        name,
        entries,
        latest1RM,
        best1RM,
        trend,
        totalSessions: entries.length,
      };
    })
    .filter((row): row is ExerciseProgressSummary => row != null)
    .sort((a, b) => b.best1RM - a.best1RM);
}

export function isRecordAtIndex(entries: Array<{ estimated1RM: number }>, index: number): boolean {
  if (index <= 0) return false;
  const previousMax = Math.max(...entries.slice(0, index).map(e => e.estimated1RM));
  return isBeatenRecord(entries[index].estimated1RM, previousMax);
}
