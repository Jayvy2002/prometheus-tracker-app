import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GoalKind } from '../../goals/domain/goalLifecycle';
import { fetchCurrentGoalRows } from '../data/clientGoals';
import { currentGoalKindsByClient } from '../domain/clientGoal';

type GoalClient = { id: string; goal?: string | null };

/**
 * Current goal kind per client (same source as the goal panel). Until the
 * goals are loaded — or when they fail to load — no goal is claimed.
 */
export function useClientGoalKinds(clients: readonly GoalClient[]) {
  const [kinds, setKinds] = useState<Record<string, GoalKind | null>>({});
  const [error, setError] = useState(false);
  const seq = useRef(0);
  const key = clients.map(c => `${c.id}:${c.goal ?? ''}`).join(',');
  // Re-query only when the set of clients (or their legacy goal) changes.
  const snapshot = useMemo(
    () => (key ? key.split(',').map(part => {
      const at = part.indexOf(':');
      return { id: part.slice(0, at), goal: part.slice(at + 1) || null };
    }) : []),
    [key],
  );

  const reload = useCallback(async () => {
    const run = ++seq.current;
    if (snapshot.length === 0) {
      setKinds({});
      setError(false);
      return;
    }
    const result = await fetchCurrentGoalRows(snapshot.map(c => c.id));
    if (run !== seq.current) return;
    if (result.error) {
      setKinds({});
      setError(true);
      return;
    }
    setError(false);
    setKinds(currentGoalKindsByClient(result.rows, snapshot));
  }, [snapshot]);

  useEffect(() => { void reload(); }, [reload]);

  return { kinds, error, reload };
}
