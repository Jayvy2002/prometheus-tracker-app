import { interventionHref } from './coachInterventions';
import { datePrefix } from './coachText';
import type {
  CoachClientSummary,
  CoachIntervention,
  CoachInterventionKind,
  CoachMessage,
  CoachMessageTemplateKey,
  CoachMessageThread,
  CoachNudgeTemplateKey,
  CoachPriority,
  CoachPriorityKind,
  CoachPrioritySeverity,
  CoachQueueAction,
  CoachQueueClientGroup,
} from './types';

const COMPOSE_KINDS = new Set<CoachPriorityKind>([
  'missed_workout',
  'missed_checkin',
  'missed_nutrition',
  'dropped_adherence',
]);

const INTERVENTION_KINDS_FOR_PRIORITY: Partial<Record<CoachPriorityKind, CoachInterventionKind[]>> = {
  stalled_lift: ['calorie_adjustment', 'program_adjustment', 'program_nl_edit', 'ask_prometheus'],
  program_adapt: ['program_adjustment', 'calorie_adjustment', 'program_nl_edit'],
  weight_off_trajectory: ['adherence_nutrition', 'calorie_adjustment', 'adherence_training'],
  nutrition_stall: ['adherence_nutrition', 'calorie_adjustment'],
  onboarding_incomplete: ['onboarding_plan'],
  program_unassigned: ['onboarding_plan', 'ask_prometheus'],
  missed_workout: ['adherence_training'],
  missed_nutrition: ['adherence_nutrition'],
  dropped_adherence: ['adherence_training', 'adherence_nutrition'],
};

const PROGRESS_QUEUE_KINDS = new Set<CoachPriorityKind>([
  'nutrition_stall',
  'weight_off_trajectory',
]);

const TEMPLATE_KEYS: CoachMessageTemplateKey[] = ['missed_training', 'missed_checkins', 'general_followup', 'reply'];

export function firstNameOf(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return '';
  if (trimmed.includes('@')) return trimmed.split('@')[0] ?? trimmed;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function matchingPendingIntervention(
  priority: CoachPriority,
  pending: CoachIntervention[],
): CoachIntervention | null {
  if (priority.kind === 'draft_pending') {
    return pending.find(row => row.id === priority.interventionId) ?? null;
  }
  const kinds = INTERVENTION_KINDS_FOR_PRIORITY[priority.kind];
  if (!kinds?.length) return null;
  return pending.find(row => row.client_id === priority.clientId && kinds.includes(row.kind)) ?? null;
}

export function resolveQueueAction(
  priority: CoachPriority,
  pending: CoachIntervention[],
): CoachQueueAction {
  const match = matchingPendingIntervention(priority, pending);
  if (match) {
    const setup = match.kind === 'onboarding_plan';
    return {
      kind: setup ? 'open_setup' : 'open_draft',
      href: interventionHref(match, { from: 'today' }),
      interventionId: match.id,
      ctaKey: setup ? 'coaching.queue.setup' : 'coaching.queue.openDraft',
    };
  }

  if (PROGRESS_QUEUE_KINDS.has(priority.kind)) {
    return {
      kind: 'open_360',
      href: priority.href,
      ctaKey: 'coaching.queue.openFile',
    };
  }

  if (priority.kind === 'session_logged') {
    return {
      kind: 'open_360',
      href: priority.href,
      ctaKey: 'coaching.queue.openSession',
    };
  }

  if (
    priority.kind === 'new_pain'
    || priority.kind === 'low_sleep'
    || priority.kind === 'high_stress'
    || priority.kind === 'low_mood'
    || priority.kind === 'high_hunger'
  ) {
    return {
      kind: 'open_360',
      href: priority.href,
      ctaKey: 'coaching.queue.openRecovery',
    };
  }

  if (priority.kind === 'onboarding_incomplete' || priority.kind === 'program_unassigned') {
    return {
      kind: 'open_setup',
      href: `/clients/${priority.clientId}/setup`,
      ctaKey: 'coaching.queue.setup',
    };
  }

  if (COMPOSE_KINDS.has(priority.kind)) {
    const templateKey: CoachNudgeTemplateKey =
      priority.kind === 'missed_workout'
        ? 'missed_training'
        : priority.kind === 'missed_checkin'
          ? 'missed_checkins'
          : 'general_followup';
    return {
      kind: 'compose',
      templateKey,
      href: relanceThreadHref(priority.clientId, templateKey),
      ctaKey: 'coaching.queue.relance',
    };
  }

  return {
    kind: 'open_360',
    href: priority.href,
    ctaKey: 'coaching.queue.openFile',
  };
}

const SEVERITY_RANK: Record<CoachPrioritySeverity, number> = { red: 0, orange: 1, yellow: 2 };

/** Lower = treat first. Drafts win, then pain/setup, then the session, then nudges. */
const KIND_PRIORITY: Partial<Record<CoachPriorityKind, number>> = {
  draft_pending: 0,
  new_pain: 1,
  onboarding_incomplete: 2,
  program_unassigned: 2,
  low_sleep: 3,
  high_stress: 3,
  low_mood: 3,
  high_hunger: 3,
  session_logged: 4,
  missed_workout: 5,
  missed_checkin: 5,
  missed_nutrition: 5,
  dropped_adherence: 5,
  stalled_lift: 6,
  program_adapt: 6,
  nutrition_stall: 6,
  weight_off_trajectory: 6,
};

function draftBoost(item: CoachPriority, pending: CoachIntervention[]): number {
  if (item.kind === 'draft_pending') return 0;
  return matchingPendingIntervention(item, pending) ? 0 : 1;
}

function compareQueueItems(a: CoachPriority, b: CoachPriority, pending: CoachIntervention[]): number {
  const draft = draftBoost(a, pending) - draftBoost(b, pending);
  if (draft !== 0) return draft;
  const kind = (KIND_PRIORITY[a.kind] ?? 8) - (KIND_PRIORITY[b.kind] ?? 8);
  if (kind !== 0) return kind;
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
}

/** The one event the File du jour should act on for this client. */
export function primaryQueueItem(
  group: CoachQueueClientGroup,
  pending: CoachIntervention[],
): CoachPriority {
  return group.items.reduce((best, item) => (
    compareQueueItems(item, best, pending) < 0 ? item : best
  ));
}

export function primaryQueueAction(
  group: CoachQueueClientGroup,
  pending: CoachIntervention[],
): { item: CoachPriority; action: CoachQueueAction } {
  const item = primaryQueueItem(group, pending);
  return { item, action: resolveQueueAction(item, pending) };
}

export function queueActionHref(item: CoachPriority, action: CoachQueueAction): string {
  return action.href || item.href;
}

export function isComposeQueueKind(kind: CoachPriorityKind): boolean {
  return COMPOSE_KINDS.has(kind);
}

export function queueItemLabelKey(item: Pick<CoachPriority, 'kind' | 'headlineKey'>): string {
  return item.kind === 'draft_pending' ? item.headlineKey : `coaching.queue.items.${item.kind}`;
}

/** Calendar days between a signal timestamp and today (today = 0). */
export function queueSinceDays(sinceIso: string | null | undefined, today: string): number | null {
  if (!sinceIso || !today) return null;
  const day = sinceIso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const from = Date.parse(`${day}T00:00:00`);
  const to = Date.parse(`${today}T00:00:00`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const days = Math.round((to - from) / 86_400_000);
  return days < 0 ? 0 : days;
}

export function queueSinceCopy(days: number | null): { key: string; params?: { n: number } } | null {
  if (days == null) return null;
  if (days <= 0) return { key: 'coaching.queue.sinceToday' };
  return { key: 'coaching.queue.sinceDays', params: { n: days } };
}

function worstSeverity(items: CoachPriority[]): CoachPrioritySeverity {
  return items.reduce<CoachPrioritySeverity>((worst, item) => (
    SEVERITY_RANK[item.severity] < SEVERITY_RANK[worst] ? item.severity : worst
  ), items[0]?.severity ?? 'yellow');
}

/** Group already-ranked queue events by client. Order = first appearance. */
export function groupQueueByClient(items: CoachPriority[]): CoachQueueClientGroup[] {
  const order: string[] = [];
  const byClient = new Map<string, CoachPriority[]>();
  for (const item of items) {
    const existing = byClient.get(item.clientId);
    if (!existing) {
      order.push(item.clientId);
      byClient.set(item.clientId, [item]);
    } else {
      existing.push(item);
    }
  }
  return order.map(clientId => {
    const list = byClient.get(clientId) ?? [];
    const first = list[0];
    return {
      clientId,
      clientName: first?.clientName ?? '',
      avatarUrl: first?.avatarUrl ?? '',
      href: first?.href ?? `/clients/${clientId}`,
      severity: worstSeverity(list),
      items: list,
    };
  });
}

export function nextClientNames(groups: CoachQueueClientGroup[], skip = 1, take = 2): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const group of groups.slice(skip)) {
    if (seen.has(group.clientId)) continue;
    seen.add(group.clientId);
    names.push(group.clientName);
    if (names.length >= take) break;
  }
  return names;
}

export function composeItemsInGroup(items: CoachPriority[]): CoachPriority[] {
  return items.filter(item => isComposeQueueKind(item.kind));
}

export const RELANCE_NUDGE_PARAM = 'nudge';

const NUDGE_KEYS: CoachNudgeTemplateKey[] = ['missed_training', 'missed_checkins', 'general_followup'];

/** One-tap Relancer: Messages thread for that client + editable draft. Never auto-sends. */
export function relanceThreadHref(clientId: string, templateKey: CoachNudgeTemplateKey): string {
  return `/messages/${clientId}?${RELANCE_NUDGE_PARAM}=${templateKey}`;
}

export function parseNudgeQuery(value: string | null | undefined): CoachNudgeTemplateKey | null {
  if (!value) return null;
  return NUDGE_KEYS.includes(value as CoachNudgeTemplateKey) ? value as CoachNudgeTemplateKey : null;
}

export function relanceHrefForGroup(
  group: CoachQueueClientGroup,
  pending: CoachIntervention[],
): string | null {
  for (const item of composeItemsInGroup(group.items)) {
    const action = resolveQueueAction(item, pending);
    if (action.kind === 'compose' && action.href) return action.href;
  }
  return null;
}

export function lastMessageForClient(messages: CoachMessage[], clientId: string): CoachMessage | null {
  return messages.find(m => m.client_id === clientId) ?? null;
}

export function visibleQueueItems(
  priorities: CoachPriority[],
  dismissedIds: readonly string[],
  clients: CoachClientSummary[],
  today: string,
): CoachPriority[] {
  const dismissed = new Set(dismissedIds);
  const nudgedToday = new Set(
    clients
      .filter(c => c.last_nudged_at && datePrefix(c.last_nudged_at) === today)
      .map(c => c.id),
  );
  return priorities.filter(item => {
    if (dismissed.has(item.id)) return false;
    if (nudgedToday.has(item.clientId) && COMPOSE_KINDS.has(item.kind)) return false;
    return true;
  });
}

const DRAFT_QUEUE_SEVERITY: Partial<Record<CoachInterventionKind, CoachPrioritySeverity>> = {
  onboarding_plan: 'orange',
  calorie_adjustment: 'orange',
};

export function draftQueueItemId(interventionId: string): string {
  return `draft:${interventionId}`;
}

/**
 * Fleet/agent drafts that no local priority already points at, as queue items —
 * so the File du jour is the single "who needs me today" list, not two lists.
 * Drafts already matched by a priority stay a badge on that priority.
 */
export function draftQueueItems(
  pending: CoachIntervention[],
  priorities: CoachPriority[],
  clients: CoachClientSummary[],
): CoachPriority[] {
  const byClient = new Map(clients.map(c => [c.id, c] as const));
  const covered = new Set(
    priorities
      .map(p => matchingPendingIntervention(p, pending)?.id ?? null)
      .filter((id): id is string => Boolean(id)),
  );
  return pending
    .filter(row =>
      row.client_id
      && row.status === 'pending'
      && !covered.has(row.id)
      && byClient.has(row.client_id))
    .map(row => {
      const client = byClient.get(row.client_id!)!;
      const title = row.title?.trim() ?? '';
      return {
        id: draftQueueItemId(row.id),
        clientId: client.id,
        clientName: client.full_name || client.email || '',
        avatarUrl: client.avatar_url ?? '',
        kind: 'draft_pending' as const,
        severity: DRAFT_QUEUE_SEVERITY[row.kind] ?? 'yellow',
        headlineKey: title ? 'coaching.queue.items.draft_pending' : `coaching.interventions.kinds.${row.kind}`,
        headlineParams: { title },
        detailKey: '',
        href: interventionHref(row, { from: 'today' }),
        interventionId: row.id,
        sinceIso: row.created_at || row.updated_at || null,
      };
    });
}

export function mapCoachMessage(raw: Record<string, unknown>): CoachMessage | null {
  const template = typeof raw.template_key === 'string' ? raw.template_key : '';
  if (!TEMPLATE_KEYS.includes(template as CoachMessageTemplateKey)) return null;
  const body = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (!body) return null;
  const coachId = String(raw.coach_id ?? '');
  return {
    id: String(raw.id ?? ''),
    coach_id: coachId,
    client_id: String(raw.client_id ?? ''),
    sender_id: String(raw.sender_id ?? coachId),
    body,
    template_key: template as CoachMessageTemplateKey,
    created_at: String(raw.created_at ?? ''),
    read_at: typeof raw.read_at === 'string' ? raw.read_at : null,
  };
}

export function groupMessageThreads(
  messages: CoachMessage[],
  clients: CoachClientSummary[],
  viewerId: string,
): CoachMessageThread[] {
  const byClient = new Map<string, CoachMessage[]>();
  for (const msg of messages) {
    const list = byClient.get(msg.client_id) ?? [];
    list.push(msg);
    byClient.set(msg.client_id, list);
  }
  const rows: CoachMessageThread[] = clients.map(client => {
    const list = (byClient.get(client.id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      clientId: client.id,
      lastMessage: list[0] ?? null,
      unreadCount: list.filter(m => m.sender_id !== viewerId && !m.read_at).length,
    };
  });
  return rows.sort((a, b) => {
    const at = a.lastMessage?.created_at ?? '';
    const bt = b.lastMessage?.created_at ?? '';
    if (at && bt) return bt.localeCompare(at);
    if (at) return -1;
    if (bt) return 1;
    return 0;
  });
}

export function templateKeyForAdherence(kind: CoachInterventionKind): CoachNudgeTemplateKey {
  if (kind === 'adherence_training') return 'missed_training';
  if (kind === 'adherence_nutrition') return 'missed_checkins';
  return 'general_followup';
}
