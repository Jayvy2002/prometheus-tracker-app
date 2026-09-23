/* Dependency-free core so performedSets can use it without an import cycle. */

/**
 * A record compares like with like: more load for at least as many reps, or
 * more reps at at least the same load. An estimated 1RM mixes rep ranges and
 * flags a light high-rep set as a « record » it is not.
 */
export type LoadReps = { weight_kg: number; reps: number };

function dominates(a: LoadReps, b: LoadReps): boolean {
  return a.weight_kg >= b.weight_kg && a.reps >= b.reps;
}

export function frontierOf(pairs: ReadonlyArray<LoadReps>): LoadReps[] {
  const out: LoadReps[] = [];
  const sorted = [...pairs].sort((a, b) => b.weight_kg - a.weight_kg || b.reps - a.reps);
  let bestReps = -1;
  for (const p of sorted) {
    if (p.reps > bestReps) {
      out.push(p);
      bestReps = p.reps;
    }
  }
  return out;
}

/**
 * The heaviest set of this session that no earlier set matches or beats.
 * A first session is a baseline, not a record.
 */
export function newComparableRecord(
  session: ReadonlyArray<LoadReps>,
  previous: ReadonlyArray<LoadReps>,
): LoadReps | null {
  if (previous.length === 0) return null;
  const fresh = session.filter(s => s.reps > 0 && !previous.some(p => dominates(p, s)));
  if (fresh.length === 0) return null;
  return fresh.reduce((a, b) => (b.weight_kg > a.weight_kg || (b.weight_kg === a.weight_kg && b.reps > a.reps) ? b : a));
}
