import type { SoloWeeklyReview } from '../../../lib/soloCopilot';

/**
 * Dashboard = today first (Vision §12): what to do now, then where I am today,
 * then what deserves a look. These rules decide what leads the first screen.
 */

/**
 * A Solo with neither a program nor a routine gets a clear first move instead
 * of a vague « Mon programme » link: a free session now, or a first routine.
 * Never for a coached athlete (his coach prescribes) and never while loading.
 */
export function showSoloStartHero(input: {
  activityPending: boolean;
  hasCoach: boolean;
  tracksWorkouts: boolean;
  hasProgram: boolean;
  hasGymCard: boolean;
  routineCount: number;
}): boolean {
  return !input.activityPending
    && !input.hasCoach
    && input.tracksWorkouts
    && !input.hasProgram
    && !input.hasGymCard
    && input.routineCount === 0;
}

/**
 * The program row names what it opens. A Solo without a program is invited to
 * plan one; with a program (or waiting for his coach's) it is « Mon programme ».
 */
export function programRowCopy(input: {
  programName: string | null;
  hasCoach: boolean;
}): { titleKey: string; subtitleKey: string | null } {
  if (input.programName) return { titleKey: 'nav.myProgram', subtitleKey: null };
  if (input.hasCoach) return { titleKey: 'nav.myProgram', subtitleKey: 'dashboard.firstRun.waitingProgram' };
  return { titleKey: 'dashboard.planProgram', subtitleKey: 'dashboard.planProgramHint' };
}

type ReviewShape = Pick<SoloWeeklyReview, 'status' | 'suppressedByDecision'> & {
  proposal: Pick<SoloWeeklyReview['proposal'], 'action' | 'draft' | 'guarded'>;
};

/**
 * The two-week review takes a full card only when a decision waits (a ready
 * proposal the Solo can apply or keep). Otherwise it is one folded line.
 */
export function soloReviewPresentation(review: ReviewShape): 'decision' | 'compact' {
  return review.status === 'ready' && !!review.proposal.draft && !review.suppressedByDecision
    ? 'decision'
    : 'compact';
}

/** The folded line says, in a few words, why there is nothing to decide. */
export function soloReviewCompactKey(review: ReviewShape): string {
  if (review.status === 'insufficient') return 'dashboard.reviewCompact.insufficient';
  if (review.suppressedByDecision) return 'dashboard.reviewCompact.noChange';
  if (review.proposal.guarded) return 'dashboard.reviewCompact.guarded';
  if (review.proposal.action === 'relance') return 'dashboard.reviewCompact.moreData';
  return 'dashboard.reviewCompact.noChange';
}

/** Cards that load on their own are shown together, once each has answered. */
export function allSettled(expected: readonly string[], settled: readonly string[]): boolean {
  return expected.every(key => settled.includes(key));
}
