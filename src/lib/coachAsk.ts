import { namesMatch, foldText, displayName } from './coachText';
import { findLift, liftsForClient, stalledLifts } from './coachLifts';
import type {
  ClientLiftProgress,
  ClientOpsRow,
  CoachPriority,
  CoachRosterSignals,
  DailyCheckin,
} from './types';

export type CoachAskFilter = 'pain' | 'stalled' | 'adherence' | 'missed' | 'weight' | 'checkin';

export type CoachAskIntent =
  | { type: 'roster'; filter: CoachAskFilter; weeks: number; raw: string }
  | { type: 'client_lift'; clientHint: string; liftHint: string; raw: string }
  | { type: 'client'; clientHint: string; raw: string }
  | { type: 'unknown'; raw: string };

export interface CoachAskHit {
  clientId: string;
  clientName: string;
  href: string;
  reason: string;
}

export interface CoachAskAnswer {
  intent: CoachAskIntent;
  titleKey: string;
  titleParams?: Record<string, string | number>;
  bodyKey: string;
  bodyParams?: Record<string, string | number>;
  hits: CoachAskHit[];
  dataUsed: string[];
  filter?: CoachAskFilter;
  secondHook: boolean;
}

const WEEK_RE = /(\d+)\s*(semaine|semaines|week|weeks)/i;

function extractWeeks(q: string): number {
  const m = q.match(WEEK_RE);
  if (!m) return 3;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.min(8, n) : 3;
}

function rosterFilter(q: string): CoachAskFilter | null {
  const f = foldText(q);
  if (/(douleur|pain|joint)/.test(f)) return 'pain';
  if (/(stagn|stall|progresse pas|not progressing|plateau)/.test(f)) return 'stalled';
  if (/(adheren|assiduite|skipped|rate seance|missed workout)/.test(f)) return 'adherence';
  if (/(poids|weight|trajectoire|trajectory)/.test(f)) return 'weight';
  if (/(check-?in|checkin)/.test(f)) return 'checkin';
  if (/(manque|missed|absent|no-show)/.test(f)) return 'missed';
  return null;
}

function looksRoster(q: string): boolean {
  const f = foldText(q);
  return /(qui|who|roster|clients?|tous|all)\b/.test(f) || rosterFilter(q) != null && !/\b(pourquoi|why|chez)\b/.test(f);
}

export function isRosterAsk(raw: string): boolean {
  return parseCoachAsk(raw).type === 'roster';
}

export function parseCoachAsk(raw: string): CoachAskIntent {
  const q = raw.trim();
  if (!q) return { type: 'unknown', raw: q };
  const folded = foldText(q);

  const liftMatch = q.match(/(?:sur|on|du|de la|de l'|the)\s+(.{3,40})$/i);
  const why = /(pourquoi|why|progresse pas|not progressing)/.test(folded);

  if (looksRoster(q) && !/(pourquoi|why)\b/.test(folded)) {
    const filter = rosterFilter(q) ?? 'stalled';
    return { type: 'roster', filter, weeks: extractWeeks(q), raw: q };
  }

  if (why || liftMatch) {
    const liftHint = liftMatch?.[1]?.trim()
      || q.replace(/^(pourquoi|why|chez|pour)\s+/i, '').trim();
    return { type: 'client_lift', clientHint: q, liftHint, raw: q };
  }

  return { type: 'client', clientHint: q, raw: q };
}

function matchClient(opsRows: ClientOpsRow[], hint: string): ClientOpsRow[] {
  return opsRows.filter(r => namesMatch(displayName(r.client), hint) || namesMatch(r.client.email, hint));
}

function painHits(opsRows: ClientOpsRow[], checkins: DailyCheckin[], days = 7): CoachAskHit[] {
  const since = Date.now() - days * 86400000;
  const byClient = new Map<string, DailyCheckin[]>();
  for (const c of checkins) {
    if (Date.parse(c.checked_at) < since) continue;
    if ((c.joint_pain ?? 0) < 3) continue;
    const list = byClient.get(c.user_id) ?? [];
    list.push(c);
    byClient.set(c.user_id, list);
  }
  return opsRows.filter(r => byClient.has(r.client.id)).map(r => {
    const latest = byClient.get(r.client.id)![0];
    return {
      clientId: r.client.id,
      clientName: displayName(r.client),
      href: `/clients/${r.client.id}?tab=health`,
      reason: `pain ${latest.joint_pain}/5`,
    };
  });
}

function stallHits(opsRows: ClientOpsRow[], lifts: ClientLiftProgress[]): CoachAskHit[] {
  return opsRows.flatMap(r => stalledLifts(liftsForClient(lifts, r.client.id)).slice(0, 2).map(l => ({
    clientId: r.client.id,
    clientName: displayName(r.client),
    href: `/clients/${r.client.id}?tab=training&exercise=${encodeURIComponent(l.displayName)}`,
    reason: l.displayName,
  })));
}

function priorityHits(priorities: CoachPriority[], kinds: CoachPriority['kind'][]): CoachAskHit[] {
  return priorities
    .filter(p => kinds.includes(p.kind))
    .map(p => ({
      clientId: p.clientId,
      clientName: p.clientName,
      href: p.href,
      reason: p.kind,
    }));
}

export function rosterHitsForFilter(
  filter: CoachAskFilter,
  opsRows: ClientOpsRow[],
  priorities: CoachPriority[],
  signals: CoachRosterSignals,
  weeks = 1,
): CoachAskHit[] {
  if (filter === 'pain') return painHits(opsRows, signals.checkins, Math.max(7, weeks * 7));
  if (filter === 'stalled') return stallHits(opsRows, signals.lifts);
  if (filter === 'adherence') return priorityHits(priorities, ['dropped_adherence', 'missed_workout']);
  if (filter === 'weight') return priorityHits(priorities, ['weight_off_trajectory']);
  if (filter === 'checkin') return priorityHits(priorities, ['missed_checkin']);
  return priorityHits(priorities, ['missed_workout', 'missed_checkin', 'missed_nutrition']);
}

export function answerCoachAsk(
  intent: CoachAskIntent,
  opsRows: ClientOpsRow[],
  priorities: CoachPriority[],
  signals: CoachRosterSignals,
): CoachAskAnswer {
  const dataUsed: string[] = [];

  if (intent.type === 'roster') {
    const hits = rosterHitsForFilter(intent.filter, opsRows, priorities, signals, intent.weeks);
    if (intent.filter === 'pain') dataUsed.push('daily_checkins.joint_pain');
    else if (intent.filter === 'stalled') dataUsed.push('workout_sets (21d)', 'workout_exercises');
    else if (intent.filter === 'adherence') dataUsed.push('daily_checkins.adherence_training', 'coach_priorities');
    else if (intent.filter === 'weight') dataUsed.push('weight_measurements', 'user_profiles.goal');
    else if (intent.filter === 'checkin') dataUsed.push('daily_checkins', 'client_tracking_config');
    else dataUsed.push('coach_priorities');
    return {
      intent,
      titleKey: `coaching.ask.roster.${intent.filter}`,
      titleParams: { n: hits.length, weeks: intent.weeks },
      bodyKey: hits.length ? 'coaching.ask.roster.body' : 'coaching.ask.roster.empty',
      bodyParams: { n: hits.length },
      hits,
      dataUsed,
      filter: intent.filter,
      secondHook: false,
    };
  }

  if (intent.type === 'client_lift' || intent.type === 'client') {
    const clients = matchClient(opsRows, intent.clientHint);
    const row = clients[0] ?? (opsRows.length === 1 ? opsRows[0] : null);
    const liftHint = intent.type === 'client_lift' ? intent.liftHint : '';
    if (!row) {
      return {
        intent,
        titleKey: 'coaching.ask.needClient',
        bodyKey: 'coaching.ask.needClientBody',
        hits: [],
        dataUsed: ['coach_client_links'],
        secondHook: true,
      };
    }
    dataUsed.push('workouts', 'workout_exercises', 'workout_sets');
    const lift = liftHint ? findLift(signals.lifts, row.client.id, liftHint) : stalledLifts(liftsForClient(signals.lifts, row.client.id))[0] ?? null;
    const sessions = lift?.sessions.slice(0, 5) ?? [];
    const last = sessions[0];
    const hits: CoachAskHit[] = [{
      clientId: row.client.id,
      clientName: displayName(row.client),
      href: lift
        ? `/clients/${row.client.id}?tab=training&exercise=${encodeURIComponent(lift.displayName)}`
        : `/clients/${row.client.id}?tab=training`,
      reason: lift ? `${lift.displayName}${last ? ` · ${last.bestSet}` : ''}` : 'overview',
    }];
    return {
      intent,
      titleKey: lift ? 'coaching.ask.liftTitle' : 'coaching.ask.clientTitle',
      titleParams: { name: displayName(row.client), lift: lift?.displayName ?? '' },
      bodyKey: lift ? (lift.stalled ? 'coaching.ask.liftStalled' : 'coaching.ask.liftOk') : 'coaching.ask.clientBody',
      bodyParams: {
        name: displayName(row.client),
        lift: lift?.displayName ?? '',
        last: last?.bestSet ?? '—',
        n: sessions.length,
      },
      hits,
      dataUsed,
      secondHook: !lift,
    };
  }

  return {
    intent,
    titleKey: 'coaching.ask.unknownTitle',
    bodyKey: 'coaching.ask.unknownBody',
    hits: [],
    dataUsed: [],
    secondHook: true,
  };
}

export function clientsFilterHref(filter: CoachAskFilter): string {
  return `/clients?filter=${filter}`;
}
