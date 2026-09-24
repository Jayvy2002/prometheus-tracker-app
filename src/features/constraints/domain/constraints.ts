/**
 * Vision §7.6 — pain, injury, limitation or temporary constraint declared by
 * the athlete (or noted by their coach). Prometheus never diagnoses: it shows
 * what was declared, suggests adapting, and says when a professional is the
 * right person.
 */

export type ConstraintKind = 'pain' | 'injury' | 'limitation' | 'constraint';
export type BodyArea =
  | 'neck' | 'shoulder' | 'elbow' | 'wrist' | 'upper_back' | 'lower_back'
  | 'hip' | 'knee' | 'ankle' | 'foot' | 'other' | 'none';
export type ConstraintPersistence = 'temporary' | 'persistent';
export type ConstraintStatus = 'open' | 'resolved';

export const CONSTRAINT_KINDS: readonly ConstraintKind[] = ['pain', 'injury', 'limitation', 'constraint'];
export const BODY_AREAS: readonly BodyArea[] = [
  'neck', 'shoulder', 'elbow', 'wrist', 'upper_back', 'lower_back', 'hip', 'knee', 'ankle', 'foot', 'other',
];

export interface AthleteConstraint {
  id: string;
  user_id: string;
  kind: ConstraintKind;
  body_area: BodyArea;
  description: string;
  severity: number | null;
  persistence: ConstraintPersistence;
  status: ConstraintStatus;
  exercise_name: string | null;
  workout_id: string | null;
  declared_at: string;
  resolved_at: string | null;
  created_by: string | null;
}

export interface ConstraintEvent {
  id: string;
  constraint_id: string;
  change: 'declared' | 'updated' | 'resolved' | 'reopened';
  severity: number | null;
  persistence: ConstraintPersistence | null;
  note: string;
  actor_id: string | null;
  occurred_at: string;
}

export interface DeclareConstraintInput {
  userId: string;
  kind: ConstraintKind;
  bodyArea: BodyArea;
  description?: string;
  severity?: number | null;
  persistence: ConstraintPersistence;
  exerciseName?: string | null;
  workoutId?: string | null;
}

/** Open first (newest first), then resolved: nothing is ever hidden for good. */
export function splitConstraints(rows: readonly AthleteConstraint[]): { open: AthleteConstraint[]; resolved: AthleteConstraint[] } {
  const byNewest = [...rows].sort((a, b) => b.declared_at.localeCompare(a.declared_at));
  return {
    open: byNewest.filter(c => c.status === 'open'),
    resolved: byNewest.filter(c => c.status === 'resolved'),
  };
}

/**
 * When to say « see a health professional »: strong pain, a known injury, or a
 * pain that persists. Advice, never a diagnosis.
 */
export function needsProfessionalAdvice(c: Pick<AthleteConstraint, 'kind' | 'severity' | 'persistence'>): boolean {
  if (c.kind === 'injury') return true;
  if (c.kind !== 'pain') return false;
  return (c.severity ?? 0) >= 4 || c.persistence === 'persistent';
}

/** The body area only matters for pain and injuries; a travel week has none. */
export function areaFor(kind: ConstraintKind, area: BodyArea): BodyArea {
  return kind === 'constraint' ? 'none' : area;
}
