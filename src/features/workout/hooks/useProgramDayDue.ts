import { useProgramStore } from '../../../stores/programStore';
import { useWorkoutStore } from '../../../stores/workoutStore';
import { isProgramDayDue, resolveClientGymCard } from '../../../lib/clientGym';
import { todayStr } from '../../../lib/utils';

/** Prescribed program day is due now (continue or start today). */
export function useProgramDayDue(): boolean {
  const assignment = useProgramStore(s => s.assignment);
  const workouts = useWorkoutStore(s => s.workouts);
  return isProgramDayDue(resolveClientGymCard({
    hasActiveProgram: assignment?.status === 'active' && !!assignment.program,
    days: assignment?.program?.days,
    workouts,
    todayWeekday: new Date().getDay(),
    todayDate: todayStr(),
    assignmentId: assignment?.id,
  }));
}
