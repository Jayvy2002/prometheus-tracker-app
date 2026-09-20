import { useProgramStore } from '../../../stores/programStore';
import { useWorkoutStore } from '../../../stores/workoutStore';
import { isProgramDayDue, resolveAssignmentGymCard } from '../../../lib/clientGym';
import { useProgramCivilClock } from '../../programs/hooks/useProgramCivilClock';

/** Prescribed program day is due now (continue or start today). */
export function useProgramDayDue(): boolean {
  const assignment = useProgramStore(s => s.assignment);
  const workouts = useWorkoutStore(s => s.workouts);
  const programClock = useProgramCivilClock();
  return isProgramDayDue(resolveAssignmentGymCard({
    assignment,
    workouts,
    todayWeekday: programClock.weekday,
    todayDate: programClock.today,
  }));
}
