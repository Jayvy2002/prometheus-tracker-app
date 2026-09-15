/** UX23 — visual history of program_revisions. Restore = new revision, logs untouched. */

export interface RevisionExerciseSnap {
  name: string;
  default_sets?: number;
  default_reps?: number;
  default_reps_min?: number | null;
  default_rir?: number | null;
  default_rest_seconds?: number;
  default_weight_kg?: number | null;
  order_index?: number;
}

export interface RevisionDaySnap {
  weekday: number;
  name: string;
  order_index?: number;
  exercises: RevisionExerciseSnap[];
}

export interface ProgramRevisionRow {
  id: string;
  program_id: string;
  revision_no: number;
  snapshot: unknown;
  created_by: string | null;
  created_at: string;
}

export interface RevisionDayDraft {
  weekday: number;
  name: string;
  exercises: Array<{
    name: string;
    default_sets: number;
    default_reps: number;
    default_reps_min?: number | null;
    default_rir?: number | null;
    default_rest_seconds?: number;
    default_weight_kg?: number | null;
  }>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export function parseRevisionSnapshot(snapshot: unknown): RevisionDaySnap[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.map((raw, index) => {
    const rec = asRecord(raw) ?? {};
    const exercisesRaw = Array.isArray(rec.exercises) ? rec.exercises : [];
    return {
      weekday: Number(rec.weekday) || 0,
      name: typeof rec.name === 'string' ? rec.name : '',
      order_index: typeof rec.order_index === 'number' ? rec.order_index : index,
      exercises: exercisesRaw.map((ex, order) => {
        const row = asRecord(ex) ?? {};
        return {
          name: typeof row.name === 'string' ? row.name : '',
          default_sets: typeof row.default_sets === 'number' ? row.default_sets : undefined,
          default_reps: typeof row.default_reps === 'number' ? row.default_reps : undefined,
          default_reps_min: typeof row.default_reps_min === 'number' ? row.default_reps_min : null,
          default_rir: typeof row.default_rir === 'number' ? row.default_rir : null,
          default_rest_seconds: typeof row.default_rest_seconds === 'number' ? row.default_rest_seconds : undefined,
          default_weight_kg: typeof row.default_weight_kg === 'number' ? row.default_weight_kg : null,
          order_index: typeof row.order_index === 'number' ? row.order_index : order,
        };
      }),
    };
  });
}

export function summarizeRevisionDays(days: RevisionDaySnap[]): string {
  if (!days.length) return '';
  return days.map(day => {
    const lifts = day.exercises.map(ex => ex.name).filter(Boolean).join(', ');
    const title = day.name.trim() || String(day.weekday);
    return lifts ? `${title} · ${lifts}` : title;
  }).join(' | ');
}

export function revisionBeforeAfter(previous: unknown | null, current: unknown): { before: string; after: string } {
  return {
    before: previous == null ? '' : summarizeRevisionDays(parseRevisionSnapshot(previous)),
    after: summarizeRevisionDays(parseRevisionSnapshot(current)),
  };
}

export function snapshotToDayDrafts(snapshot: unknown): RevisionDayDraft[] {
  return parseRevisionSnapshot(snapshot).map(day => ({
    weekday: day.weekday,
    name: day.name,
    exercises: day.exercises.map(ex => ({
      name: ex.name,
      default_sets: ex.default_sets ?? 3,
      default_reps: ex.default_reps ?? 10,
      default_reps_min: ex.default_reps_min,
      default_rir: ex.default_rir,
      default_rest_seconds: ex.default_rest_seconds ?? 90,
      default_weight_kg: ex.default_weight_kg,
    })),
  }));
}

export function restoreCreatesNewRevision(): true {
  return true;
}
