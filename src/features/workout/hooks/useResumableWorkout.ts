import { useWorkoutStore } from '../../../stores/workoutStore';
import { addDaysToDateStr, todayStr } from '../../../lib/utils';
import { pickResumableWorkout } from '../domain/resumableSession';

/** The unfinished session the app offers to resume, or null. */
export function useResumableWorkout() {
  const workouts = useWorkoutStore(s => s.workouts);
  const current = useWorkoutStore(s => s.currentWorkout);
  const today = todayStr();
  return pickResumableWorkout(workouts, current, today, addDaysToDateStr(today, -1));
}
