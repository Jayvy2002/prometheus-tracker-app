import { useMemo } from 'react';
import { useProfileStore } from '../../../stores/profileStore';
import { civilDateInTimeZone, weekdayFromCivilDate } from '../../../lib/utils';

/** Program phase/week/calendar clock = profile TZ, same contract as the server. */
export function useProgramCivilClock(): { today: string; weekday: number } {
  const timezone = useProfileStore(s => s.profile?.timezone);
  return useMemo(() => {
    const today = civilDateInTimeZone(timezone);
    return { today, weekday: weekdayFromCivilDate(today) };
  }, [timezone]);
}
