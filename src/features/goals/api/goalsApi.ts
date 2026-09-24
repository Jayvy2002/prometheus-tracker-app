import { supabase } from '../../../lib/supabase';
import type { Goal, GoalEvent, GoalKind, GoalStatus } from '../domain/goalLifecycle';

/** Goals and their transitions for one athlete (RLS: the athlete or their active coach). */
export async function fetchGoals(userId: string): Promise<{ goals: Goal[]; events: GoalEvent[]; error: string | null }> {
  const [goalsRes, eventsRes] = await Promise.all([
    supabase.from('athlete_goals').select('*').eq('user_id', userId).order('started_at', { ascending: false }),
    supabase.from('athlete_goal_events').select('*').eq('user_id', userId).order('occurred_at', { ascending: false }).limit(200),
  ]);
  const error = goalsRes.error?.message ?? eventsRes.error?.message ?? null;
  return {
    goals: (goalsRes.data ?? []) as Goal[],
    events: (eventsRes.data ?? []) as GoalEvent[],
    error,
  };
}

export interface StartGoalInput {
  userId: string;
  kind: GoalKind;
  title?: string;
  targetWeightKg?: number | null;
  targetDate?: string | null;
  reason?: string;
}

export async function startGoal(input: StartGoalInput): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('start_goal', {
    p_user: input.userId,
    p_kind: input.kind,
    p_title: input.title ?? '',
    p_target_weight_kg: input.targetWeightKg ?? null,
    p_target_date: input.targetDate || null,
    p_reason: input.reason ?? '',
  });
  if (error) return { id: null, error: error.message };
  return { id: (data as string) ?? null, error: null };
}

export async function transitionGoal(goalId: string, to: GoalStatus, reason = ''): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('transition_goal', { p_goal: goalId, p_to: to, p_reason: reason });
  return { error: error?.message ?? null };
}
