export interface ScheduledProgramDay {
  weekday: number;
}

/** The active program is the training contract; profile frequency is only a fallback. */
export function resolveTrainingFrequency(
  profileFrequency: number | null | undefined,
  programDays: ScheduledProgramDay[] | number | null | undefined,
): number {
  const programFrequency = typeof programDays === 'number'
    ? Math.trunc(programDays)
    : new Set((programDays ?? []).map(day => day.weekday).filter(day => day >= 0 && day <= 6)).size;
  if (programFrequency > 0) return programFrequency;

  const profile = Math.trunc(Number(profileFrequency) || 0);
  return profile > 0 ? profile : 3;
}
