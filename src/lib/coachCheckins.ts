import { relanceThreadHref } from './coachQueue';
import { recoveryFocusHref } from './coachRecovery';
import { displayName } from './coachText';
import type {
  CheckinReviewKind,
  CheckinReviewRow,
  ClientOpsRow,
  CoachNudgeTemplateKey,
  CoachPriority,
  CoachPriorityKind,
  CoachRosterSignals,
  DailyCheckin,
} from './types';

export const CHECKIN_QUERY_PARAM = 'checkin';

export const CHECKIN_REVIEW_KINDS: CoachPriorityKind[] = [
  'new_pain',
  'dropped_adherence',
  'missed_checkin',
];

const FLAG_RANK: Record<Extract<CoachPriorityKind, 'new_pain' | 'dropped_adherence' | 'missed_checkin'>, number> = {
  new_pain: 0,
  dropped_adherence: 1,
  missed_checkin: 2,
};

export function isCheckinReviewKind(kind: CoachPriorityKind): boolean {
  return CHECKIN_REVIEW_KINDS.includes(kind);
}

export function parseCheckinQuery(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80 || /\s/.test(trimmed)) return null;
  return trimmed;
}

export function checkinFocusHref(clientId: string, checkinId?: string | null): string {
  const base = `/clients/${clientId}?tab=checkins`;
  return checkinId ? `${base}&${CHECKIN_QUERY_PARAM}=${encodeURIComponent(checkinId)}` : base;
}

export function checkinIdFromHref(href: string): string | null {
  const query = href.split('?')[1];
  if (!query) return null;
  return parseCheckinQuery(new URLSearchParams(query).get(CHECKIN_QUERY_PARAM));
}

export function latestCheckinFor(
  signals: Pick<CoachRosterSignals, 'checkins'>,
  clientId: string,
): DailyCheckin | null {
  const rows = signals.checkins
    .filter(c => c.user_id === clientId)
    .sort((a, b) => b.checked_at.localeCompare(a.checked_at) || b.created_at.localeCompare(a.created_at));
  return rows[0] ?? null;
}

export function isUnreadCheckin(
  checkin: DailyCheckin,
  lastVisitedAt: string | null | undefined,
): boolean {
  if (!lastVisitedAt) return true;
  const submitted = checkin.created_at || checkin.updated_at || checkin.checked_at;
  return submitted > lastVisitedAt;
}

export function relanceTemplateForCheckinKind(kind: CheckinReviewKind | CoachPriorityKind): CoachNudgeTemplateKey {
  return kind === 'missed_checkin' ? 'missed_checkins' : 'general_followup';
}

export function relanceHrefForCheckin(
  clientId: string,
  kind: CheckinReviewKind | CoachPriorityKind,
): string {
  return relanceThreadHref(clientId, relanceTemplateForCheckinKind(kind));
}

export function flagKindForClient(
  priorities: CoachPriority[],
  clientId: string,
): Extract<CoachPriorityKind, 'new_pain' | 'dropped_adherence' | 'missed_checkin'> | null {
  let best: Extract<CoachPriorityKind, 'new_pain' | 'dropped_adherence' | 'missed_checkin'> | null = null;
  for (const p of priorities) {
    if (p.clientId !== clientId || !isCheckinReviewKind(p.kind)) continue;
    const kind = p.kind as Extract<CoachPriorityKind, 'new_pain' | 'dropped_adherence' | 'missed_checkin'>;
    if (!best || FLAG_RANK[kind] < FLAG_RANK[best]) best = kind;
  }
  return best;
}

export function checkinReviewRows(
  opsRows: ClientOpsRow[],
  signals: CoachRosterSignals,
  priorities: CoachPriority[],
): CheckinReviewRow[] {
  const rows: CheckinReviewRow[] = [];
  for (const ops of opsRows) {
    const latest = latestCheckinFor(signals, ops.client.id);
    if (!latest) continue;
    const flag = flagKindForClient(priorities, ops.client.id);
    const unread = isUnreadCheckin(latest, ops.client.last_visited_at);
    if (!unread) continue;
    const kind: CheckinReviewKind = flag === 'new_pain' || flag === 'dropped_adherence' || flag === 'missed_checkin'
      ? flag
      : 'unread';
    rows.push({
      clientId: ops.client.id,
      clientName: displayName(ops.client),
      avatarUrl: ops.client.avatar_url,
      checkin: latest,
      href: kind === 'new_pain'
        ? recoveryFocusHref(ops.client.id, latest.id)
        : checkinFocusHref(ops.client.id, latest.id),
      kind,
      relanceHref: relanceHrefForCheckin(ops.client.id, kind),
    });
  }
  const order: Record<CheckinReviewKind, number> = {
    new_pain: 0,
    dropped_adherence: 1,
    unread: 2,
    missed_checkin: 3,
  };
  return rows.sort((a, b) => order[a.kind] - order[b.kind] || a.clientName.localeCompare(b.clientName));
}

export function focusCheckin(
  checkins: DailyCheckin[],
  checkinId: string | null,
): DailyCheckin | null {
  if (!checkinId) return checkins[0] ?? null;
  return checkins.find(c => c.id === checkinId) ?? checkins[0] ?? null;
}
