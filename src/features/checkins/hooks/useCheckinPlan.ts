import { useCallback, useEffect, useState } from 'react';
import { fetchPlan } from '../api/checkinPlanApi';
import type { CheckinPlan, CheckinTemplate } from '../domain/checkinTemplate';

/** The check-in plan of one athlete (no plan = daily, no custom question). */
export function useCheckinPlan(userId: string | null | undefined) {
  const [plan, setPlan] = useState<CheckinPlan | null>(null);
  const [template, setTemplate] = useState<CheckinTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const result = await fetchPlan(userId);
    setLoading(false);
    setError(result.error);
    if (!result.error) {
      setPlan(result.plan);
      setTemplate(result.template);
    }
  }, [userId]);

  useEffect(() => { void reload(); }, [reload]);
  return { plan, template, loading, error, reload };
}
