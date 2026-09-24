/**
 * Vision §6 — a goal is a living cycle, not a profile field. The transitions
 * below mirror `transition_goal` (migration 20260924130000); the database is
 * the authority, this only decides which buttons to show.
 */

export type GoalKind = 'cut' | 'maintain' | 'bulk' | 'performance' | 'health' | 'other';
export type GoalStatus = 'active' | 'reached' | 'maintenance' | 'replaced' | 'paused' | 'abandoned';

export const GOAL_KINDS: readonly GoalKind[] = ['cut', 'maintain', 'bulk', 'performance', 'health', 'other'];

export interface Goal {
  id: string;
  user_id: string;
  kind: GoalKind;
  title: string;
  target_weight_kg: number | null;
  target_date: string | null;
  status: GoalStatus;
  predecessor_id: string | null;
  started_at: string;
  ended_at: string | null;
  created_by: string | null;
}

export interface GoalEvent {
  id: string;
  goal_id: string;
  from_status: GoalStatus | null;
  to_status: GoalStatus;
  reason: string;
  metrics: { weight_kg?: number; weight_measured_at?: string };
  actor_id: string | null;
  occurred_at: string;
}

/** « replaced » only comes from starting a new goal; closed states stay closed. */
export const GOAL_TRANSITIONS: Record<GoalStatus, readonly GoalStatus[]> = {
  active: ['reached', 'maintenance', 'paused', 'abandoned'],
  maintenance: ['active', 'paused', 'abandoned'],
  paused: ['active', 'abandoned'],
  reached: ['maintenance'],
  replaced: [],
  abandoned: [],
};

export function allowedGoalTransitions(status: GoalStatus): readonly GoalStatus[] {
  return GOAL_TRANSITIONS[status] ?? [];
}

/**
 * The actions worth offering for this goal. A « maintain » goal has nothing to
 * reach and is already maintenance, so only pause / abandon (and resume) remain.
 */
export function goalActions(goal: Pick<Goal, 'kind' | 'status'>): readonly GoalStatus[] {
  const allowed = allowedGoalTransitions(goal.status);
  if (goal.kind !== 'maintain') return allowed;
  return allowed.filter(to => to !== 'reached' && to !== 'maintenance');
}

/** Body goals drive the calorie calculators; the others do not touch them. */
export function isBodyGoal(kind: GoalKind): kind is 'cut' | 'maintain' | 'bulk' {
  return kind === 'cut' || kind === 'maintain' || kind === 'bulk';
}

/** The goal shown first: pursued or maintained, else a paused one waiting to resume. */
export function focusGoal(goals: readonly Goal[]): Goal | null {
  const newest = [...goals].sort((a, b) => b.started_at.localeCompare(a.started_at));
  return newest.find(g => g.status === 'active' || g.status === 'maintenance')
    ?? newest.find(g => g.status === 'paused')
    ?? null;
}

/** Everything else, newest first: the history is never lost. */
export function goalHistory(goals: readonly Goal[], focus: Goal | null): Goal[] {
  return [...goals]
    .filter(g => g.id !== focus?.id)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

/** The reason given when a goal left its last state, if any. */
export function lastReason(goal: Goal, events: readonly GoalEvent[]): string {
  const own = events
    .filter(e => e.goal_id === goal.id && e.reason.trim() && e.reason !== 'migrated' && e.reason !== 'profile')
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return own[0]?.reason ?? '';
}
