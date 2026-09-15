/** UX64 — a reminder fires only if the task is still true. */

export type DailyReminderKind = 'workout' | 'nutrition';

export interface DailyReminderFacts {
  kind: DailyReminderKind;
  trackingOn: boolean;
  loggedToday: boolean;
  hasAssignedProgram: boolean;
  todayIsTrainingDay: boolean;
}

export function weekdayInTimeZone(now: Date, timeZone: string | null | undefined): number {
  const tz = (timeZone ?? '').trim() || 'UTC';
  try {
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(now);
    const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(day);
    return idx >= 0 ? idx : now.getUTCDay();
  } catch {
    return now.getUTCDay();
  }
}

export function isProgramTrainingWeekday(
  days: Array<{ weekday: number; name?: string | null; exerciseCount?: number }>,
  weekday: number,
): boolean {
  const training = days.filter(day => (day.name ?? '').trim().length > 0 || (day.exerciseCount ?? 0) > 0);
  if (training.length === 0) return false;
  return training.some(day => day.weekday === weekday);
}

/** False = do not send. Rest day, finished log, or module off are not a task. */
export function shouldSendDailyReminder(facts: DailyReminderFacts): boolean {
  if (!facts.trackingOn) return false;
  if (facts.loggedToday) return false;
  if (facts.kind === 'workout' && facts.hasAssignedProgram && !facts.todayIsTrainingDay) return false;
  return true;
}

export function shouldShowReminderPermissionPrompt(input: {
  reminderAlreadyEnabled: boolean;
  permission: NotificationPermission | 'unsupported';
  dismissed: boolean;
}): boolean {
  if (input.dismissed) return false;
  if (input.reminderAlreadyEnabled) return false;
  if (input.permission === 'denied' || input.permission === 'unsupported') return false;
  return true;
}
