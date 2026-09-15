import { useEffect, useState } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { useWorkoutStore, type ExerciseSession } from '../../../stores/workoutStore';

export function useExerciseHistory(exerciseName: string, workoutId: string | undefined) {
  const { user } = useAuthStore();
  const fetchExerciseHistory = useWorkoutStore(s => s.fetchExerciseHistory);
  const [history, setHistory] = useState<ExerciseSession[]>([]);

  useEffect(() => {
    if (!user || !workoutId) return;
    fetchExerciseHistory(user.id, exerciseName, workoutId, 5).then(setHistory);
  }, [user?.id, exerciseName, workoutId]); // eslint-disable-line react-hooks/exhaustive-deps

  return history;
}
