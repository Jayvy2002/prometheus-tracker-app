import { lastVisitIso } from './coachPriorities';
import { datePrefix } from './coachText';
import { liftsForClient, progressedLifts, stalledLifts } from './coachLifts';
import type {
  CheckinSummary,
  ClientLiftProgress,
  ClientOpsRow,
  CoachRosterSignals,
  DailyCheckin,
  WeightMeasurement,
} from './types';

export interface SinceLastVisit {
  since: string | null;
  source: 'visit' | 'note' | 'intervention' | 'link';
  workoutsCompleted: number;
  weightDeltaKg: number | null;
  progressed: string[];
  stalled: string[];
  pain: number | null;
  checkins: number;
}

export interface ClientKpis {
  progression: 'up' | 'flat' | 'down' | 'unknown';
  trainingAdherence: number | null;
  recovery: number | null;
  weightDelta: number | null;
  pain: number | null;
}

function mean(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function invert(score: number | null): number | null {
  if (score == null) return null;
  return Math.round((6 - score) * 10) / 10;
}

export function summarizeCheckin(checkins: DailyCheckin[]): CheckinSummary {
  const sorted = [...checkins].sort((a, b) => b.checked_at.localeCompare(a.checked_at));
  const latest = sorted[0] ?? null;
  const previous = sorted[1] ?? null;
  if (!latest) {
    return {
      latest: null,
      previous: null,
      globalStatus: 'unknown',
      training: null,
      recovery: null,
      nutrition: null,
      motivation: null,
      pain: null,
      deltas: { training: null, recovery: null, nutrition: null, motivation: null, pain: null },
    };
  }

  const recovery = mean([latest.sleep_quality, invert(latest.fatigue), invert(latest.muscle_soreness), latest.energy_level]);
  const prevRecovery = previous
    ? mean([previous.sleep_quality, invert(previous.fatigue), invert(previous.muscle_soreness), previous.energy_level])
    : null;
  const training = latest.adherence_training;
  const nutrition = latest.adherence_nutrition;
  const motivation = latest.motivation;
  const pain = latest.joint_pain;

  const delta = (a: number | null, b: number | null) =>
    a != null && b != null ? Math.round((a - b) * 10) / 10 : null;

  let globalStatus: CheckinSummary['globalStatus'] = 'good';
  if ((pain ?? 0) >= 4 || (training ?? 5) <= 2 || (recovery ?? 5) <= 2) globalStatus = 'concern';
  else if ((pain ?? 0) >= 3 || (training ?? 5) <= 3 || (recovery ?? 5) <= 3) globalStatus = 'watch';

  return {
    latest,
    previous,
    globalStatus,
    training,
    recovery,
    nutrition,
    motivation,
    pain,
    deltas: {
      training: delta(training, previous?.adherence_training ?? null),
      recovery: delta(recovery, prevRecovery),
      nutrition: delta(nutrition, previous?.adherence_nutrition ?? null),
      motivation: delta(motivation, previous?.motivation ?? null),
      pain: delta(pain, previous?.joint_pain ?? null),
    },
  };
}

function sourceFor(row: ClientOpsRow, signals: CoachRosterSignals, since: string | null): SinceLastVisit['source'] {
  if (since && since === row.client.last_visited_at) return 'visit';
  if (since && since === signals.lastNoteAt[row.client.id]) return 'note';
  if (since && since === signals.lastInterventionAt[row.client.id]) return 'intervention';
  return 'link';
}

export function sinceLastVisit(
  row: ClientOpsRow,
  signals: CoachRosterSignals,
  workouts: Array<{ date: string; completed: boolean }>,
): SinceLastVisit {
  const since = lastVisitIso(row, signals);
  const sinceDay = since ? datePrefix(since) : null;
  const clientLifts = liftsForClient(signals.lifts, row.client.id);
  const after = (iso: string) => !sinceDay || datePrefix(iso) >= sinceDay;

  const weights = signals.weights
    .filter(w => w.user_id === row.client.id)
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const afterWeights = sinceDay ? weights.filter(w => datePrefix(w.measured_at) >= sinceDay) : weights;
  const startW = afterWeights[0] ?? weights[0];
  const endW = afterWeights[afterWeights.length - 1] ?? weights[weights.length - 1];
  const weightDeltaKg = startW && endW
    ? Math.round((endW.weight_kg - startW.weight_kg) * 10) / 10
    : null;

  const checkins = signals.checkins.filter(c => c.user_id === row.client.id && after(c.checked_at));
  const pain = checkins
    .map(c => c.joint_pain)
    .filter((n): n is number => n != null)
    .sort((a, b) => b - a)[0] ?? null;

  const recentLifts: ClientLiftProgress[] = clientLifts.map(l => ({
    ...l,
    sessions: l.sessions.filter(s => after(s.date)),
  }));

  return {
    since,
    source: sourceFor(row, signals, since),
    workoutsCompleted: workouts.filter(w => w.completed && after(w.date)).length,
    weightDeltaKg,
    progressed: progressedLifts(recentLifts).slice(0, 4),
    stalled: stalledLifts(recentLifts).map(l => l.displayName).slice(0, 4),
    pain,
    checkins: checkins.length,
  };
}

export function clientKpis(
  insight: SinceLastVisit,
  checkin: CheckinSummary,
  lifts: ClientLiftProgress[],
  weights: WeightMeasurement[],
): ClientKpis {
  let progression: ClientKpis['progression'] = 'unknown';
  if (insight.progressed.length > insight.stalled.length && insight.progressed.length > 0) progression = 'up';
  else if (insight.stalled.length > 0 && insight.progressed.length === 0) progression = 'down';
  else if (lifts.some(l => l.sessions.length >= 2)) progression = 'flat';

  const sortedW = [...weights].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const weightDelta = sortedW.length >= 2
    ? Math.round((sortedW[sortedW.length - 1].weight_kg - sortedW[0].weight_kg) * 10) / 10
    : insight.weightDeltaKg;

  return {
    progression,
    trainingAdherence: checkin.training,
    recovery: checkin.recovery,
    weightDelta,
    pain: checkin.pain ?? insight.pain,
  };
}

export function programWeekLabel(
  startDate: string | undefined,
  durationWeeks: number | undefined,
  today = new Date(),
): { current: number; total: number } | null {
  if (!startDate || !durationWeeks) return null;
  const start = new Date(`${startDate.slice(0, 10)}T00:00:00`);
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((todayLocal.getTime() - start.getTime()) / 86400000);
  const current = diffDays < 0 ? 1 : Math.min(durationWeeks, Math.floor(diffDays / 7) + 1);
  return { current, total: durationWeeks };
}
