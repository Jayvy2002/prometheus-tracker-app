import { addDaysToDateStr, todayStr } from './utils';
import type {
  ClientAlertKind,
  ClientOpsRow,
  ClientTrackingConfig,
  CoachClientSummary,
} from './types';

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

export interface CoachOpsFacts {
  today: string;
  weekAgo: string;
  weekday: number;
  checkinUserIds: Set<string>;
  nutritionUserIds: Set<string>;
  weightUserIds: Set<string>;
  workoutDatesByUser: Map<string, string[]>;
  scheduledWeekdaysByClient: Map<string, Set<number>>;
  assignedClientIds: Set<string>;
  trackingByClient: Map<string, Pick<ClientTrackingConfig, 'track_weight' | 'track_checkins' | 'track_nutrition' | 'track_workouts' | 'setup_completed_at'> | ClientTrackingConfig>;
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

      if (tracking.track_checkins && !facts.checkinUserIds.has(client.id)) {
        alerts.push('missing_checkin');
      }
      if (tracking.track_nutrition && !facts.nutritionUserIds.has(client.id)) {
        alerts.push('missing_nutrition');
      }
      if (tracking.track_weight && !facts.weightUserIds.has(client.id)) {
        alerts.push('missing_weight');
      }
      if (tracking.track_workouts) {
        const dates = facts.workoutDatesByUser.get(client.id) ?? [];
        const trainedToday = dates.includes(facts.today);
        if (hasProgram) {
          if (hasScheduledTrainingToday && !trainedToday) {
            alerts.push('missing_workout_today');
          }
        } else if (!dates.some(d => d >= facts.weekAgo)) {
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
