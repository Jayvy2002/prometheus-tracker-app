import { addDaysToDateStr, todayStr } from '../../../lib/utils';
import type {
  ClientAlertKind,
  ClientOpsRow,
  ClientTrackingConfig,
  CoachClientSummary,
} from '../../../lib/types';

const DEFAULT_TRACKING: Pick<
  ClientTrackingConfig,
  'track_weight' | 'track_checkins' | 'track_nutrition' | 'track_workouts' | 'setup_completed_at'
> = {
  track_weight: true,
  track_checkins: true,
  track_nutrition: true,
  track_workouts: true,
  setup_completed_at: null,
};

/**
 * A missing log is not a fault (Vision §8.1, §11.2). The coach is only told
 * about silence that lasts a whole window, and never before the relationship
 * is at least that old: a client linked this morning has missed nothing.
 */
export const CHECKIN_WINDOW_DAYS = 7;
export const NUTRITION_WINDOW_DAYS = 3;
export const WEIGHT_WINDOW_DAYS = 7;
export const WORKOUT_WINDOW_DAYS = 7;

/** First day of a window of `days` days ending today (inclusive). */
export function windowStart(today: string, days: number): string {
  return addDaysToDateStr(today, -(days - 1));
}

/** True when the link is at least `days` old, so a full window could be observed. */
export function linkedForAtLeast(linkedAt: string | null | undefined, today: string, days: number): boolean {
  if (!linkedAt) return true;
  return linkedAt.slice(0, 10) <= addDaysToDateStr(today, -days);
}

export interface CoachOpsFacts {
  today: string;
  weekAgo: string;
  weekday: number;
  localHour: number;
  missedWorkoutCutoffHour: number;
  /** Clients with a check-in in the last CHECKIN_WINDOW_DAYS days. */
  checkinUserIds: Set<string>;
  /** Clients with a food log in the last NUTRITION_WINDOW_DAYS days. */
  nutritionUserIds: Set<string>;
  /** Clients with a weigh-in in the last WEIGHT_WINDOW_DAYS days. */
  weightUserIds: Set<string>;
  workoutDatesByUser: Map<string, string[]>;
  scheduledWeekdaysByClient: Map<string, Set<number>>;
  assignedClientIds: Set<string>;
  trackingByClient: Map<string, Pick<ClientTrackingConfig, 'track_weight' | 'track_checkins' | 'track_nutrition' | 'track_workouts' | 'setup_completed_at'> | ClientTrackingConfig>;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function coachClockFacts(now: Date, timezone: string): Pick<CoachOpsFacts, 'today' | 'weekday' | 'localHour'> {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short', hour: '2-digit', hourCycle: 'h23',
    });
  } catch {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short', hour: '2-digit', hourCycle: 'h23',
    });
  }
  const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
  return {
    today: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
    localHour: Number(parts.hour) || 0,
  };
}

function weekdayRank(weekday: number): number {
  return (weekday + 6) % 7;
}

export function weekAgoStr(today = todayStr()): string {
  return addDaysToDateStr(today, -6);
}

export function datePrefix(value: string): string {
  return value.slice(0, 10);
}

export function buildClientOpsRows(clients: CoachClientSummary[], facts: CoachOpsFacts): ClientOpsRow[] {
  return clients.map(client => {
    const tracking = facts.trackingByClient.get(client.id) ?? DEFAULT_TRACKING;
    const hasProgram = facts.assignedClientIds.has(client.id);
    const setupCompleted = !!tracking.setup_completed_at;
    const scheduledDays = facts.scheduledWeekdaysByClient.get(client.id);
    const hasScheduledTrainingToday = !!scheduledDays?.has(facts.weekday);
    const alerts: ClientAlertKind[] = [];

    if (!client.onboarding_completed) {
      alerts.push('onboarding_incomplete');
    } else {
      if (!hasProgram) alerts.push('program_unassigned');

      const observed = (days: number) => linkedForAtLeast(client.linked_at, facts.today, days);
      if (tracking.track_checkins && observed(CHECKIN_WINDOW_DAYS) && !facts.checkinUserIds.has(client.id)) {
        alerts.push('missing_checkin');
      }
      if (tracking.track_nutrition && observed(NUTRITION_WINDOW_DAYS) && !facts.nutritionUserIds.has(client.id)) {
        alerts.push('missing_nutrition');
      }
      if (tracking.track_weight && observed(WEIGHT_WINDOW_DAYS) && !facts.weightUserIds.has(client.id)) {
        alerts.push('missing_weight');
      }
      if (tracking.track_workouts) {
        const dates = facts.workoutDatesByUser.get(client.id) ?? [];
        const trainedToday = dates.includes(facts.today);
        if (hasProgram) {
          const weekStart = addDaysToDateStr(facts.today, -weekdayRank(facts.weekday));
          const completedThisWeek = new Set(
            dates.filter(date => date >= weekStart && date <= facts.today),
          ).size;
          const scheduledBeforeToday = [...(scheduledDays ?? [])]
            .filter(day => weekdayRank(day) < weekdayRank(facts.weekday)).length;
          const todayIsDue = hasScheduledTrainingToday
            && facts.localHour >= facts.missedWorkoutCutoffHour;
          const expectedByNow = scheduledBeforeToday + (todayIsDue ? 1 : 0);

          if (todayIsDue && !trainedToday && completedThisWeek < expectedByNow) {
            alerts.push('missing_workout_today');
          } else if (completedThisWeek < scheduledBeforeToday) {
            alerts.push('missing_workout_week');
          }
        } else if (observed(WORKOUT_WINDOW_DAYS) && !dates.some(d => d >= facts.weekAgo)) {
          alerts.push('missing_workout_week');
        }
      }
    }

    return {
      client,
      alerts,
      hasScheduledTrainingToday,
      hasProgram,
      setupCompleted,
    };
  });
}

export function needsSetup(row: ClientOpsRow): boolean {
  return row.client.onboarding_completed && (!row.hasProgram || !row.setupCompleted);
}

/** Force the setup page only when onboarding is incomplete or neither program nor tracking exists. */
export function shouldOpenSetup(row: ClientOpsRow): boolean {
  if (!row.client.onboarding_completed) return true;
  return !row.setupCompleted && !row.hasProgram;
}

export function isSetupAlert(kind: ClientAlertKind): boolean {
  return kind === 'onboarding_incomplete' || kind === 'program_unassigned';
}
