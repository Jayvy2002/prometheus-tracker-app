import { focusGoal, GOAL_KINDS, type Goal, type GoalKind } from '../../goals/domain/goalLifecycle';
import { normalizeGoal } from './coachNutrition';

/**
 * Vision §6 — one goal, one label. The client list, the client file header and
 * the goal panel all say the same thing: the athlete's current goal
 * (`athlete_goals`, same focus rule as the goal panel), else the legacy profile
 * goal for an athlete who has no goal history yet. Labels: `goals.kinds.*`.
 */

/** Legacy `user_profiles.goal` → goal kind (lose/gain aliases included). */
export function legacyGoalKind(goal: string | null | undefined): GoalKind | null {
  const normalized = normalizeGoal(goal);
  if (normalized) return normalized;
  const raw = (goal ?? '').trim().toLowerCase();
  return (GOAL_KINDS as readonly string[]).includes(raw) ? raw as GoalKind : null;
}

export function currentGoalKind(
  goals: readonly Goal[],
  legacyGoal: string | null | undefined,
): GoalKind | null {
  return focusGoal(goals)?.kind ?? legacyGoalKind(legacyGoal);
}

/** Current goal per client from one batch of goal rows (any order, several users). */
export function currentGoalKindsByClient(
  rows: readonly Goal[],
  clients: ReadonlyArray<{ id: string; goal?: string | null }>,
): Record<string, GoalKind | null> {
  const byUser = new Map<string, Goal[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }
  const out: Record<string, GoalKind | null> = {};
  for (const client of clients) {
    out[client.id] = currentGoalKind(byUser.get(client.id) ?? [], client.goal);
  }
  return out;
}

export function goalKindLabelKey(kind: GoalKind): string {
  return `goals.kinds.${kind}`;
}
