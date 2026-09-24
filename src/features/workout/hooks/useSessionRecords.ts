import { useEffect, useState } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import type { Workout } from '../../../lib/types';
import { fetchComparableHistory } from '../data/fetchComparableHistory';
import { sessionRecords, type SessionRecord } from '../domain/comparableRecords';

/** Records of a finished session; empty until the history is read, and on failure. */
export function useSessionRecords(workout: Workout): SessionRecord[] {
  const userId = useAuthStore(s => s.user?.id);
  const [records, setRecords] = useState<SessionRecord[]>([]);

  useEffect(() => {
    if (!userId || !workout.id || !workout.date) return;
    let cancelled = false;
    const exercises = workout.exercises ?? [];
    void fetchComparableHistory(userId, exercises.map(ex => ex.name), workout.id, workout.date)
      .then(history => {
        if (!cancelled && history) setRecords(sessionRecords(exercises, history));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId, workout]);

  return records;
}
