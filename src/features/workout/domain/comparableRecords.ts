import { isPerformedSet } from './performedSets';
import { frontierOf, newComparableRecord, type LoadReps } from './loadRepFrontier';

export { frontierOf, newComparableRecord, type LoadReps };

type SetLike = {
  weight_kg?: number | null;
  reps?: number | null;
  completed?: boolean | null;
  set_type?: string | null;
};

/** Performed sets reduced to those no other set of the list beats on both axes. */
export function loadRepFrontier(sets: ReadonlyArray<SetLike> | null | undefined): LoadReps[] {
  const pairs = (sets ?? [])
    .filter(isPerformedSet)
    .map(s => ({ weight_kg: Math.max(0, s.weight_kg ?? 0), reps: Math.max(0, s.reps ?? 0) }))
    .filter(p => p.reps > 0);
  return frontierOf(pairs);
}

export function exerciseKey(name: string): string {
  return name.trim().toLowerCase();
}

export type SessionRecord = { name: string; set: LoadReps };

/** Records of a finished session against the athlete's earlier history. */
export function sessionRecords(
  exercises: ReadonlyArray<{ name: string; sets?: ReadonlyArray<SetLike> | null }> | null | undefined,
  previousByExercise: Readonly<Record<string, ReadonlyArray<LoadReps>>>,
): SessionRecord[] {
  const grouped = new Map<string, { name: string; sets: SetLike[] }>();
  for (const ex of exercises ?? []) {
    const key = exerciseKey(ex.name);
    const group = grouped.get(key) ?? { name: ex.name, sets: [] };
    group.sets.push(...(ex.sets ?? []));
    grouped.set(key, group);
  }
  const out: SessionRecord[] = [];
  for (const [key, group] of grouped) {
    const record = newComparableRecord(loadRepFrontier(group.sets), previousByExercise[key] ?? []);
    if (record) out.push({ name: group.name, set: record });
  }
  return out;
}
