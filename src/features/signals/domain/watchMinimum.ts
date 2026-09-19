/** P2.6 Vision 8.7 — apply the accepted watch calorie draft. No program rewrite. */

import type { AthleteDecisionLog } from '../types';
import {
  calorieDraftFromUnknown,
  type CalorieDraft,
} from '../../../../supabase/functions/_shared/weeklyNutritionProposal.ts';
import { WATCH_PROPOSAL_SOURCE } from './watchProposal';

export const WATCH_MINIMUM_APPLY_KIND = 'watch_minimum_apply' as const;

export function watchMinimumApplyIdempotencyKey(signalId: string, weekStart: string): string {
  return `watch-apply:${signalId}:${weekStart}`.slice(0, 200);
}

export function calorieDraftFromDecisionProposal(
  proposal: Record<string, unknown> | null | undefined,
): CalorieDraft | null {
  if (!proposal) return null;
  return calorieDraftFromUnknown(proposal.draft);
}

export function isWatchMinimumApplyEligible(
  decision: Pick<AthleteDecisionLog, 'decision' | 'source' | 'proposal' | 'applied_effect'> | null,
): boolean {
  if (!decision) return false;
  if (decision.source !== WATCH_PROPOSAL_SOURCE) return false;
  if (decision.decision !== 'accepted') return false;
  if (decision.proposal?.kind === WATCH_MINIMUM_APPLY_KIND) return false;
  if (decision.proposal?.kind !== 'watch_proposal_decision') return false;
  if (calorieDraftFromDecisionProposal(decision.proposal) == null) return false;
  const effect = decision.applied_effect;
  if (effect && typeof effect === 'object' && Object.keys(effect).length > 0) return false;
  return true;
}
