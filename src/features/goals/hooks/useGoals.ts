import { useCallback, useEffect, useState } from 'react';
import { fetchGoals, startGoal, transitionGoal, type StartGoalInput } from '../api/goalsApi';
import { isBodyGoal, type Goal, type GoalEvent, type GoalStatus } from '../domain/goalLifecycle';
import { useProfileStore } from '../../../stores/profileStore';
import { soloNutritionTargets } from '../../nutrition/domain/soloTargets';

/**
 * Goals of one athlete. After a change the profile is refreshed (the database
 * keeps its legacy `goal` in step); a Solo's targets follow a new body goal
 * when real measurements allow it.
 */
export function useGoals(userId: string | null | undefined, opts: { recomputeSoloTargets?: boolean } = {}) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<GoalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const result = await fetchGoals(userId);
    setLoading(false);
    setError(result.error);
    if (!result.error) {
      setGoals(result.goals);
      setEvents(result.events);
    }
  }, [userId]);

  useEffect(() => { void reload(); }, [reload]);

  const afterChange = useCallback(async (bodyGoal: string | null) => {
    await reload();
    if (!userId) return;
    const store = useProfileStore.getState();
    if (store.profile?.id !== userId) return;
    await store.fetchProfile(userId, { silent: true });
    const profile = useProfileStore.getState().profile;
    if (opts.recomputeSoloTargets && bodyGoal && profile) {
      const targets = soloNutritionTargets(profile, bodyGoal);
      if (targets) await store.updateProfile(userId, targets);
    }
  }, [reload, userId, opts.recomputeSoloTargets]);

  const start = useCallback(async (input: Omit<StartGoalInput, 'userId'>) => {
    if (!userId || busy) return { error: 'busy' };
    setBusy(true);
    const result = await startGoal({ ...input, userId });
    setBusy(false);
    if (!result.error) await afterChange(isBodyGoal(input.kind) ? input.kind : null);
    return { error: result.error };
  }, [userId, busy, afterChange]);

  const transition = useCallback(async (goalId: string, to: GoalStatus, reason?: string) => {
    if (busy) return { error: 'busy' };
    setBusy(true);
    const result = await transitionGoal(goalId, to, reason);
    setBusy(false);
    if (!result.error) await afterChange(to === 'maintenance' ? 'maintain' : null);
    return result;
  }, [busy, afterChange]);

  return { goals, events, loading, error, busy, reload, start, transition };
}
