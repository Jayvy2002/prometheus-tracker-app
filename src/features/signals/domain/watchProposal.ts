/** P2.5 Vision 8.6 — human decision on the current watch proposal. No source rewrite. */

import { WATCH_CONTEXT_CORRECTION_SOURCE } from './watchContext';

export const WATCH_PROPOSAL_KIND = 'watch_proposal_decision' as const;

export const WATCH_PROPOSAL_DECISIONS = ['accepted', 'modified', 'refused'] as const;

export type WatchProposalDecision = (typeof WATCH_PROPOSAL_DECISIONS)[number];

export const WATCH_PROPOSAL_SOURCE = WATCH_CONTEXT_CORRECTION_SOURCE;

const DECISION_VERBS = new Set<string>([...WATCH_PROPOSAL_DECISIONS, 'ignored', 'corrected']);

export const WATCH_PROPOSAL_COPY_KEYS = {
  relance: 'prometheusWatch.proposal.relance',
  nutritionRelance: 'prometheusWatch.proposal.nutritionRelance',
  calories: 'prometheusWatch.proposal.calories',
  program: 'prometheusWatch.proposal.program',
  draftCalories: 'prometheusWatch.proposal.draftCalories',
} as const;

export function isWatchProposalDecision(value: string): value is WatchProposalDecision {
  return (WATCH_PROPOSAL_DECISIONS as readonly string[]).includes(value);
}

export function watchProposalIdempotencyKey(
  signalId: string,
  decision: WatchProposalDecision,
  weekStart: string,
): string {
  return `watch-decide:${signalId}:${decision}:${weekStart}`.slice(0, 200);
}

export function isWatchProposalWeekStart(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isWatchProposalReviewId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function watchProposalReasonRequired(decision: WatchProposalDecision): boolean {
  return decision === 'modified' || decision === 'refused';
}

export function isConcreteWatchProposal(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const kind = typeof row.kind === 'string' ? row.kind.trim() : '';
  const action = typeof row.action === 'string' ? row.action.trim() : '';
  if (!kind || !action) return false;
  if (DECISION_VERBS.has(action)) return false;
  return true;
}

export function watchProposalCopyKey(proposal: unknown): string | null {
  if (!isConcreteWatchProposal(proposal)) return null;
  const row = proposal as Record<string, unknown>;
  const kind = String(row.kind);
  const action = String(row.action);
  const type = typeof row.type === 'string' ? row.type : '';
  const flag = typeof row.flag === 'string' ? row.flag : '';
  if (action === 'calorie_adjustment' || kind === 'calorie_adjustment') {
    return WATCH_PROPOSAL_COPY_KEYS.calories;
  }
  if (action === 'program_adjustment' || kind === 'program_adjustment') {
    return WATCH_PROPOSAL_COPY_KEYS.program;
  }
  if (
    kind === 'adherence_nutrition'
    || type === 'not_following'
    || type === 'sparse_nutrition'
    || flag === 'adherence_nutrition'
  ) {
    return WATCH_PROPOSAL_COPY_KEYS.nutritionRelance;
  }
  if (action === 'relance' || kind === 'adherence_training') {
    return WATCH_PROPOSAL_COPY_KEYS.relance;
  }
  return null;
}

export function watchProposalDraftCalories(proposal: unknown): number | null {
  if (!isConcreteWatchProposal(proposal)) return null;
  const row = proposal as Record<string, unknown>;
  const draft = row.draft;
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
  const calories = (draft as Record<string, unknown>).calories;
  if (typeof calories === 'number' && Number.isFinite(calories)) return calories;
  if (typeof calories === 'string' && calories.trim() && Number.isFinite(Number(calories))) {
    return Number(calories);
  }
  return null;
}
