import { checkinReviewRows } from './coachCheckins';
import { displayName } from './coachText';
import type {
  ClientOpsRow,
  CoachClientSummary,
  CoachMessage,
  CoachPriority,
  CoachPriorityKind,
  CoachRosterSignals,
} from '../../../lib/types';

/**
 * Vision §15.1 — the File du jour also carries what already arrived and waits
 * on the coach: unread messages and check-ins not yet read. Built only from
 * data the Coach dashboard already loads (active relationships only), never a
 * score; each item says who, what and where to go.
 */

/** Check-in signals already in the queue: the check-in is covered by them. */
const CHECKIN_DERIVED_KINDS = new Set<CoachPriorityKind>([
  'new_pain',
  'low_sleep',
  'high_stress',
  'low_mood',
  'high_hunger',
  'dropped_adherence',
  'missed_checkin',
]);

export function unreadMessagesQueueId(clientId: string, latestUnreadId: string): string {
  // A newer message brings the row back even if an older one was skipped today.
  return `msg:${clientId}:${latestUnreadId}`;
}

export function checkinReceivedQueueId(checkinId: string): string {
  return `checkin:${checkinId}`;
}

/** One row per active client with unread messages from them. Prospects are excluded. */
export function unreadMessageQueueItems(
  messages: readonly CoachMessage[],
  clients: readonly CoachClientSummary[],
  viewerId: string | null | undefined,
): CoachPriority[] {
  if (!viewerId) return [];
  const byClient = new Map(clients.map(client => [client.id, client] as const));
  const unread = new Map<string, CoachMessage[]>();
  for (const message of messages) {
    if (message.read_at || message.sender_id === viewerId) continue;
    if (message.coach_id !== viewerId) continue;
    if (!byClient.has(message.client_id)) continue;
    const list = unread.get(message.client_id) ?? [];
    list.push(message);
    unread.set(message.client_id, list);
  }
  const items: CoachPriority[] = [];
  for (const [clientId, list] of unread) {
    const client = byClient.get(clientId)!;
    const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const oldest = sorted[0];
    const newest = sorted[sorted.length - 1];
    items.push({
      id: unreadMessagesQueueId(clientId, newest.id),
      clientId,
      clientName: displayName(client),
      avatarUrl: client.avatar_url ?? '',
      kind: 'unread_messages',
      severity: 'orange',
      headlineKey: 'coaching.queue.items.unread_messages',
      headlineParams: { count: sorted.length },
      detailKey: '',
      href: `/messages/${clientId}`,
      sinceIso: oldest.created_at || null,
    });
  }
  return items.sort((a, b) => (a.sinceIso ?? '').localeCompare(b.sinceIso ?? '') || a.clientName.localeCompare(b.clientName));
}

/**
 * Check-ins submitted since the coach last opened the file. A check-in that
 * already raised a signal (pain, sleep, stress…) stays that signal: no duplicate.
 */
export function checkinReceivedQueueItems(
  opsRows: readonly ClientOpsRow[],
  signals: CoachRosterSignals,
  priorities: readonly CoachPriority[],
): CoachPriority[] {
  const covered = new Set(
    priorities.filter(p => CHECKIN_DERIVED_KINDS.has(p.kind)).map(p => p.clientId),
  );
  return checkinReviewRows([...opsRows], signals, [...priorities])
    .filter(row => row.kind === 'unread' && !covered.has(row.clientId))
    .map(row => ({
      id: checkinReceivedQueueId(row.checkin.id),
      clientId: row.clientId,
      clientName: row.clientName,
      avatarUrl: row.avatarUrl ?? '',
      kind: 'checkin_received' as const,
      severity: 'yellow' as const,
      headlineKey: 'coaching.queue.items.checkin_received',
      detailKey: '',
      href: row.href,
      checkinId: row.checkin.id,
      sinceIso: row.checkin.created_at || row.checkin.checked_at || null,
    }));
}

export interface SessionTodayRow {
  clientId: string;
  clientName: string;
  avatarUrl: string;
  programName: string | null;
  href: string;
}

/**
 * Clients whose program places a session today (fixed weekdays only: an « in
 * order » program has no day, so nothing is claimed). Context, not a decision.
 */
export function sessionsTodayRows(
  opsRows: readonly ClientOpsRow[],
  signals: Pick<CoachRosterSignals, 'assignmentName'>,
): SessionTodayRow[] {
  return opsRows
    .filter(row => row.hasScheduledTrainingToday && row.hasProgram)
    .map(row => ({
      clientId: row.client.id,
      clientName: displayName(row.client),
      avatarUrl: row.client.avatar_url ?? '',
      programName: (signals.assignmentName[row.client.id] ?? '').trim() || null,
      href: `/clients/${row.client.id}?tab=training`,
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName, 'fr', { sensitivity: 'base' }));
}
