/** P2.5 Vision 8.6 — human decision on the current watch proposal. No source rewrite. */

import { WATCH_CONTEXT_CORRECTION_SOURCE } from './watchContext';

export const WATCH_PROPOSAL_KIND = 'watch_proposal_decision' as const;

export const WATCH_PROPOSAL_DECISIONS = ['accepted', 'modified', 'refused'] as const;

export type WatchProposalDecision = (typeof WATCH_PROPOSAL_DECISIONS)[number];

export const WATCH_PROPOSAL_SOURCE = WATCH_CONTEXT_CORRECTION_SOURCE;

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

export function watchProposalReasonRequired(decision: WatchProposalDecision): boolean {
  return decision === 'modified' || decision === 'refused';
}
