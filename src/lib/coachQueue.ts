import { interventionHref } from './coachInterventions';
import { datePrefix } from './coachText';
import type {
  CoachClientSummary,
  CoachIntervention,
  CoachInterventionKind,
  CoachMessage,
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
  missed_workout: ['adherence_training'],
  dropped_adherence: ['adherence_training'],
  missed_nutrition: ['adherence_nutrition'],
  stalled_lift: ['calorie_adjustment', 'program_adjustment'],
  program_adapt: ['program_adjustment', 'calorie_adjustment'],
  weight_off_trajectory: ['calorie_adjustment'],
  onboarding_incomplete: ['onboarding_plan'],
  program_unassigned: ['onboarding_plan'],
};

const TEMPLATE_KEYS: CoachNudgeTemplateKey[] = ['missed_training', 'missed_checkins', 'general_followup'];

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
  if (!TEMPLATE_KEYS.includes(template as CoachNudgeTemplateKey)) return null;
  const body = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (!body) return null;
  return {
    id: String(raw.id ?? ''),
    coach_id: String(raw.coach_id ?? ''),
    client_id: String(raw.client_id ?? ''),
    body,
    template_key: template as CoachNudgeTemplateKey,
    created_at: String(raw.created_at ?? ''),
    read_at: typeof raw.read_at === 'string' ? raw.read_at : null,
  };
}
