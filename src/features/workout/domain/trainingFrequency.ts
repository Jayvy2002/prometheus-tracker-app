export interface ScheduledProgramDay {
  weekday: number | null;
}

/** The active program is the training contract; profile frequency is only a fallback. */
export function resolveTrainingFrequency(
  profileFrequency: number | null | undefined,
  programDays: ScheduledProgramDay[] | number | null | undefined,
): number {
  let programFrequency = 0;
  if (typeof programDays === 'number') {
    programFrequency = Math.trunc(programDays);
  } else {
    const days = programDays ?? [];
    const weekdays = days
      .map(day => day.weekday)
      .filter((day): day is number => typeof day === 'number' && day >= 0 && day <= 6);
    // in_order: weekdays are null — count sessions, do not coerce null to Sunday.
    programFrequency = weekdays.length > 0 ? new Set(weekdays).size : days.length;
  }
  if (programFrequency > 0) return programFrequency;

  const profile = Math.trunc(Number(profileFrequency) || 0);
  return profile > 0 ? profile : 3;
}
