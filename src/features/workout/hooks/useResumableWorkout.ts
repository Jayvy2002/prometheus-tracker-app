import { useEffect } from 'react';
import { create } from 'zustand';
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

/**
 * One resume point per screen: a card that already offers « Continuer » for a
 * session registers it, and the global resume bar steps aside for that session.
 */
const useInlineResume = create<{ workoutIds: string[] }>(() => ({ workoutIds: [] }));

export function useRegisterInlineResume(workoutId: string | null | undefined) {
  useEffect(() => {
    if (!workoutId) return;
    useInlineResume.setState(s => ({ workoutIds: [...s.workoutIds, workoutId] }));
    return () => {
      useInlineResume.setState(s => {
        const i = s.workoutIds.indexOf(workoutId);
        return i < 0 ? s : { workoutIds: [...s.workoutIds.slice(0, i), ...s.workoutIds.slice(i + 1)] };
      });
    };
  }, [workoutId]);
}

export function useIsResumeShownInline(workoutId: string | null | undefined): boolean {
  return useInlineResume(s => Boolean(workoutId) && s.workoutIds.includes(workoutId as string));
}
