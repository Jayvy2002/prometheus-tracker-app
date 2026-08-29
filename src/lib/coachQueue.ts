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
  weight_off_trajectory: ['calorie_adjustment'],
  nutrition_stall: ['calorie_adjustment'],
  onboarding_incomplete: ['onboarding_plan'],
  program_unassigned: ['onboarding_plan', 'ask_prometheus'],
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
  const kinds = INTERVENTION_KINDS_FOR_PRIORITY[priority.kind];
  if (!kinds?.length) return null;
  return pending.find(row => row.client_id === priority.clientId && kinds.includes(row.kind)) ?? null;
}

export function resolveQueueAction(
  priority: CoachPriority,
  pending: CoachIntervention[],
): CoachQueueAction {
  if (PROGRESS_QUEUE_KINDS.has(priority.kind)) {
    return {
      kind: 'open_360',
      href: priority.href,
      ctaKey: 'coaching.queue.openFile',
    };
  }

  const match = matchingPendingIntervention(priority, pending);
  if (match) {
    const setup = match.kind === 'onboarding_plan';
    return {
      kind: setup ? 'open_setup' : 'open_draft',
      href: interventionHref(match),
      interventionId: match.id,
      ctaKey: setup ? 'coaching.queue.setup' : 'coaching.queue.openDraft',
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

export function isComposeQueueKind(kind: CoachPriorityKind): boolean {
  return COMPOSE_KINDS.has(kind);
}

export function queueItemLabelKey(kind: CoachPriorityKind): string {
  return `coaching.queue.items.${kind}`;
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
