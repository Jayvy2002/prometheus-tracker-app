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
  CoachQueueAction,
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
  onboarding_incomplete: ['onboarding_plan'],
  program_unassigned: ['onboarding_plan', 'ask_prometheus'],
};

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
      ctaKey: 'coaching.queue.relance',
    };
  }

  return {
    kind: 'open_360',
    href: priority.href,
    ctaKey: 'coaching.queue.openFile',
  };
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
