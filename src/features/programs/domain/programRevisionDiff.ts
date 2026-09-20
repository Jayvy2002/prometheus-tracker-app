/** UX23 — visual history of program_revisions. Restore = new revision, logs untouched. */
import type { Program } from '../types';

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
  id?: string;
  weekday: number | null;
  name: string;
  order_index?: number;
  phase_id?: string | null;
  exercises: RevisionExerciseSnap[];
}

export interface ProgramRevisionRow {
  id: string;
  program_id: string;
  revision_no: number;
  snapshot: unknown;
  created_by: string | null;
  created_at: string;
  activated_at?: string | null;
  superseded_at?: string | null;
  version_start_on?: string | null;
}

export interface RevisionDayDraft {
  id?: string;
  weekday: number | null;
  name: string;
  phase_id?: string | null;
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
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function snapshotDaysRaw(snapshot: unknown): unknown[] {
  if (Array.isArray(snapshot)) return snapshot;
  const rec = asRecord(snapshot);
  return Array.isArray(rec?.days) ? rec.days : [];
}

export function parseRevisionOrganization(snapshot: unknown): 'fixed_days' | 'in_order' {
  if (Array.isArray(snapshot) || snapshot == null) return 'fixed_days';
  const rec = asRecord(snapshot);
  return rec?.session_organization === 'in_order' ? 'in_order' : 'fixed_days';
}

export function parseRevisionMeta(snapshot: unknown): {
  name?: string;
  description?: string;
  duration_weeks?: number;
} {
  const rec = asRecord(snapshot);
  if (!rec) return {};
  const weeks = typeof rec.duration_weeks === 'number' ? rec.duration_weeks : Number(rec.duration_weeks);
  return {
    name: typeof rec.name === 'string' && rec.name.trim() ? rec.name : undefined,
    description: typeof rec.description === 'string' ? rec.description : undefined,
    duration_weeks: Number.isFinite(weeks) && weeks >= 1 && weeks <= 52 ? weeks : undefined,
  };
}

function parseWeekday(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
}

export function parseRevisionSnapshot(snapshot: unknown): RevisionDaySnap[] {
  return snapshotDaysRaw(snapshot).map((raw, index) => {
    const rec = asRecord(raw) ?? {};
    const exercisesRaw = Array.isArray(rec.exercises) ? rec.exercises : [];
    return {
      id: typeof rec.id === 'string' && rec.id ? rec.id : undefined,
      weekday: parseWeekday(rec.weekday),
      name: typeof rec.name === 'string' ? rec.name : '',
      order_index: typeof rec.order_index === 'number' ? rec.order_index : index,
      phase_id: typeof rec.phase_id === 'string' && rec.phase_id ? rec.phase_id : null,
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
    const title = day.name.trim() || (day.weekday != null ? String(day.weekday) : '');
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
    id: day.id,
    weekday: day.weekday,
    name: day.name,
    phase_id: day.phase_id ?? null,
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

export function snapshotToPhaseDrafts(snapshot: unknown): Array<{
  id?: string;
  name: string;
  description?: string;
  duration_weeks: number | null;
}> {
  const rec = asRecord(snapshot);
  const raw = Array.isArray(rec?.phases) ? rec.phases : [];
  return raw.map((item, order_index) => {
    const row = asRecord(item) ?? {};
    const weeks = typeof row.duration_weeks === 'number' ? row.duration_weeks : null;
    return {
      id: typeof row.id === 'string' && row.id ? row.id : undefined,
      name: typeof row.name === 'string' ? row.name : `Phase ${order_index + 1}`,
      description: typeof row.description === 'string' ? row.description : '',
      duration_weeks: weeks != null && weeks >= 1 && weeks <= 52 ? weeks : null,
    };
  }).filter(phase => phase.name.trim());
}

/** Paused/completed archives reconstruct the frozen revision, never the live graph. */
export function programFromFrozenRevision(input: {
  meta: Pick<Program, 'id' | 'owner_id' | 'created_at' | 'updated_at'>;
  revisionNo: number;
  versionStartOn?: string | null;
  snapshot: unknown;
}): Program {
  const daysSnap = parseRevisionSnapshot(input.snapshot);
  const days = daysSnap.map((day, order_index) => {
    const dayId = day.id ?? `frozen-day-${input.revisionNo}-${order_index}`;
    return {
      id: dayId,
      program_id: input.meta.id,
      weekday: day.weekday,
      name: day.name,
      routine_id: null,
      order_index: day.order_index ?? order_index,
      phase_id: day.phase_id ?? null,
      created_at: input.meta.created_at,
      exercises: day.exercises.map((ex, i) => ({
        id: `frozen-ex-${input.revisionNo}-${order_index}-${i}`,
        program_day_id: dayId,
        name: ex.name,
        default_sets: ex.default_sets ?? 3,
        default_reps: ex.default_reps ?? 10,
        default_reps_min: ex.default_reps_min,
        default_rir: ex.default_rir,
        default_rest_seconds: ex.default_rest_seconds ?? 90,
        default_weight_kg: ex.default_weight_kg,
        order_index: ex.order_index ?? i,
        created_at: input.meta.created_at,
      })),
    };
  });
  const phases = snapshotToPhaseDrafts(input.snapshot).map((phase, order_index) => ({
    id: phase.id ?? `frozen-phase-${input.revisionNo}-${order_index}`,
    program_id: input.meta.id,
    name: phase.name,
    description: phase.description,
    order_index,
    duration_weeks: phase.duration_weeks,
  }));
  const snapMeta = parseRevisionMeta(input.snapshot);
  return {
    id: input.meta.id,
    owner_id: input.meta.owner_id,
    name: snapMeta.name ?? '',
    description: snapMeta.description ?? '',
    duration_weeks: snapMeta.duration_weeks ?? 8,
    session_organization: parseRevisionOrganization(input.snapshot),
    phases,
    days,
    active_revision_no: input.revisionNo,
    scheduled_revision_no: null,
    scheduled_activates_on: null,
    scheduled_activation_timezone: null,
    scheduled_snapshot: null,
    phase_anchor_on: input.versionStartOn ?? null,
    created_at: input.meta.created_at,
    updated_at: input.meta.updated_at,
  };
}
