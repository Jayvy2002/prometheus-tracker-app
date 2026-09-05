import { needsSetup } from './coachAlerts';
import { checkinFocusHref, checkinReviewRows } from './coachCheckins';
import { nutritionStallFocusHref, nutritionStallPriority, normalizeGoal } from './coachNutrition';
import { displayName } from './coachText';
import { liftsForClient } from './coachLifts';
import { sessionLoggedPriority } from './coachLastSession';
import { lowSleepPriority, painPriority } from './coachRecovery';
import { pickDefaultLift, trainingFocusHref } from './coachTraining';
import { todayStr } from './utils';
import type {
  ClientAlertKind,
  ClientLiftProgress,
  ClientOpsRow,
  CoachCommandStats,
  CoachInboxKind,
  CoachPriority,
  CoachPriorityKind,
  CoachPrioritySeverity,
  CoachRosterSignals,
  DailyCheckin,
  WeightMeasurement,
} from './types';

const SEVERITY_RANK: Record<CoachPrioritySeverity, number> = { red: 0, orange: 1, yellow: 2 };

function hrefFor(clientId: string, tab: string, extra = ''): string {
  return `/clients/${clientId}?tab=${tab}${extra}`;
}

function checkinsFor(signals: CoachRosterSignals, clientId: string): DailyCheckin[] {
  return signals.checkins
    .filter(c => c.user_id === clientId)
    .sort((a, b) => b.checked_at.localeCompare(a.checked_at));
}

function withCheckin(priority: CoachPriority, checkin: DailyCheckin | null): CoachPriority {
  if (!checkin) return { ...priority, href: checkinFocusHref(priority.clientId) };
  return {
    ...priority,
    checkinId: checkin.id,
    href: checkinFocusHref(priority.clientId, checkin.id),
  };
}

function weightsFor(signals: CoachRosterSignals, clientId: string): WeightMeasurement[] {
  return signals.weights
    .filter(w => w.user_id === clientId)
    .sort((a, b) => b.measured_at.localeCompare(a.measured_at));
}

function adherencePriority(clientId: string, name: string, avatar: string, latest: DailyCheckin, prev: DailyCheckin | null): CoachPriority | null {
  const now = latest.adherence_training;
  if (now == null || prev?.adherence_training == null) return null;
  const drop = prev.adherence_training - now;
  if (drop < 2) return null;
  return {
    id: `${clientId}-adherence`,
    clientId,
    clientName: name,
    avatarUrl: avatar,
    kind: 'dropped_adherence',
    severity: drop >= 3 ? 'red' : 'orange',
    headlineKey: 'coaching.priority.headlines.dropped_adherence',
    headlineParams: { name },
    detailKey: 'coaching.priority.details.dropped_adherence',
    detailParams: { from: prev.adherence_training, to: now },
    href: hrefFor(clientId, 'checkins'),
  };
}

function weightPriority(row: ClientOpsRow, weights: WeightMeasurement[]): CoachPriority | null {
  if (weights.length < 2) return null;
  const goal = normalizeGoal(row.client.goal);
  const newest = weights[0].weight_kg;
  const older = weights[Math.min(weights.length - 1, 3)].weight_kg;
  const delta = Math.round((newest - older) * 10) / 10;
  const off =
    (goal === 'cut' && delta >= 0.6)
    || (goal === 'bulk' && delta <= -0.6)
    || (goal === 'maintain' && Math.abs(delta) >= 1.5);
  if (!off) return null;
  const { client } = row;
  const name = displayName(client);
  return {
    id: `${client.id}-weight`,
    clientId: client.id,
    clientName: name,
    avatarUrl: client.avatar_url,
    kind: 'weight_off_trajectory',
    severity: Math.abs(delta) >= 1.5 ? 'red' : 'orange',
    headlineKey: 'coaching.priority.headlines.weight_off_trajectory',
    headlineParams: { name },
    detailKey: 'coaching.priority.details.weight_off_trajectory',
    detailParams: { delta: delta > 0 ? `+${delta}` : String(delta), goal: goal || '—' },
    href: nutritionStallFocusHref(client.id),
  };
}

function stallPriority(row: ClientOpsRow, lifts: ClientLiftProgress[]): CoachPriority[] {
  const stalled = liftsForClient(lifts, row.client.id).filter(l => l.stalled);
  const name = displayName(row.client);
  return stalled.slice(0, 2).map(lift => ({
    id: `${row.client.id}-stall-${lift.exerciseName}`,
    clientId: row.client.id,
    clientName: name,
    avatarUrl: row.client.avatar_url,
    kind: 'stalled_lift' as const,
    severity: 'orange' as const,
    headlineKey: 'coaching.priority.headlines.stalled_lift',
    headlineParams: { name, lift: lift.displayName },
    detailKey: 'coaching.priority.details.stalled_lift',
    detailParams: { lift: lift.displayName, n: lift.sessions.length },
    href: trainingFocusHref(row.client.id, lift.displayName),
    exerciseName: lift.displayName,
  }));
}

function fromAlert(
  row: ClientOpsRow,
  kind: ClientAlertKind,
  mapped: CoachPriorityKind,
  severity: CoachPrioritySeverity,
  tab: string,
): CoachPriority {
  const name = displayName(row.client);
  return {
    id: `${row.client.id}-${kind}`,
    clientId: row.client.id,
    clientName: name,
    avatarUrl: row.client.avatar_url,
    kind: mapped,
    severity,
    headlineKey: `coaching.priority.headlines.${mapped}`,
    headlineParams: { name },
    detailKey: `coaching.alerts.${kind}`,
    href: hrefFor(row.client.id, tab),
  };
}

/** `today` is injectable so fixtures with fixed dates stay green regardless of the wall clock. */
export function buildCoachPriorities(
  opsRows: ClientOpsRow[],
  signals: CoachRosterSignals,
  today: string = todayStr(),
): CoachPriority[] {
  const items: CoachPriority[] = [];

  for (const row of opsRows) {
    const name = displayName(row.client);
    const checkins = checkinsFor(signals, row.client.id);
    const latest = checkins[0] ?? null;
    const prev = checkins[1] ?? null;

    if (latest) {
      const pain = painPriority(row.client.id, name, row.client.avatar_url, latest, prev, today);
      if (pain) items.push(pain);
      const sleep = lowSleepPriority(row.client.id, name, row.client.avatar_url, latest, today);
      if (sleep) items.push(sleep);
      const adh = adherencePriority(row.client.id, name, row.client.avatar_url, latest, prev);
      if (adh) items.push(withCheckin(adh, latest));
    }

    items.push(...stallPriority(row, signals.lifts));

    const nutrition = nutritionStallPriority(row, signals, today);
    if (nutrition) {
      items.push(nutrition);
    } else {
      const weight = weightPriority(row, weightsFor(signals, row.client.id));
      if (weight) items.push(weight);
    }

    if (row.alerts.includes('onboarding_incomplete')) {
      items.push(fromAlert(row, 'onboarding_incomplete', 'onboarding_incomplete', 'orange', 'overview'));
    } else if (row.alerts.includes('program_unassigned') || needsSetup(row)) {
      items.push(fromAlert(row, 'program_unassigned', 'program_unassigned', 'orange', 'overview'));
    }

    const logged = sessionLoggedPriority(row, signals.lifts, today);
    if (logged) items.push(logged);

    if (row.alerts.includes('missing_workout_week') || row.alerts.includes('missing_workout_today')) {
      const weekMissed = row.alerts.includes('missing_workout_week');
      const picked = pickDefaultLift(liftsForClient(signals.lifts, row.client.id), { today });
      items.push({
        ...fromAlert(
          row,
          weekMissed ? 'missing_workout_week' : 'missing_workout_today',
          'missed_workout',
          weekMissed ? 'orange' : 'yellow',
          'training',
        ),
        href: trainingFocusHref(row.client.id, picked?.displayName),
        exerciseName: picked?.displayName,
      });
    }
    if (row.alerts.includes('missing_checkin')) {
      items.push(withCheckin(
        fromAlert(row, 'missing_checkin', 'missed_checkin', 'yellow', 'checkins'),
        latest,
      ));
    }
    if (row.alerts.includes('missing_nutrition')) {
      items.push(fromAlert(row, 'missing_nutrition', 'missed_nutrition', 'yellow', 'overview'));
    }

    const clientLifts = liftsForClient(signals.lifts, row.client.id);
    const stalledHere = clientLifts.some(l => l.stalled);
    if (stalledHere && row.hasProgram) {
      const focus = clientLifts.find(l => l.stalled) ?? pickDefaultLift(clientLifts, { today });
      items.push({
        id: `${row.client.id}-adapt`,
        clientId: row.client.id,
        clientName: name,
        avatarUrl: row.client.avatar_url,
        kind: 'program_adapt',
        severity: 'yellow',
        headlineKey: 'coaching.priority.headlines.program_adapt',
        headlineParams: { name },
        detailKey: 'coaching.priority.details.program_adapt',
        href: trainingFocusHref(row.client.id, focus?.displayName),
        exerciseName: focus?.displayName,
      });
    }
  }

  const seen = new Set<string>();
  return items
    .filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.clientName.localeCompare(b.clientName));
}

export function commandStats(
  opsRows: ClientOpsRow[],
  priorities: CoachPriority[],
  signals: CoachRosterSignals,
): CoachCommandStats {
  const attentionIds = new Set(priorities.map(p => p.clientId));
  return {
    activeClients: opsRows.length,
    needAttention: attentionIds.size,
    checkinsToReview: checkinReviewRows(opsRows, signals, priorities).length,
    programsMayAdapt: priorities.filter(p => p.kind === 'stalled_lift' || p.kind === 'program_adapt' || p.kind === 'program_unassigned').length,
    important: priorities.filter(p => p.severity === 'red').length,
  };
}

export function inboxItems(priorities: CoachPriority[]): Array<CoachPriority & { inboxKind: CoachInboxKind }> {
  return priorities
    .filter(p => p.kind === 'new_pain' || p.kind === 'dropped_adherence' || p.kind === 'missed_checkin' || p.kind === 'missed_workout')
    .map(p => ({
      ...p,
      inboxKind: (p.kind === 'new_pain' ? 'pain' : p.kind === 'dropped_adherence' ? 'adherence' : 'checkin') as CoachInboxKind,
    }));
}

export function lastVisitIso(row: ClientOpsRow, signals: CoachRosterSignals): string | null {
  const id = row.client.id;
  const candidates = [
    row.client.last_visited_at,
    signals.lastNoteAt[id],
    signals.lastInterventionAt[id],
  ].filter((v): v is string => !!v);
  if (candidates.length === 0) return row.client.linked_at || null;
  return candidates.reduce((a, b) => (a > b ? a : b));
}
