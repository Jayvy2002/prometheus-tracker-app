/**
 * P2.3 — human decision journal (docs/VISION.md §8.6).
 * Mapping and evidence comparison live in `_shared/proposalMemory.ts`
 * so Solo, Coach and Deno `coach-fleet-round` cannot drift.
 */

import { canMutateAthleteSignal } from './athleteSignals';

export {
  ATHLETE_DECISION_ACTOR_ROLES,
  ATHLETE_HUMAN_DECISIONS,
  DECISION_EVIDENCE_KCAL_DELTA,
  DECISION_EVIDENCE_LOG_DAYS_DELTA,
  DECISION_EVIDENCE_WEIGHT_DELTA_KG,
  DECISION_EVIDENCE_WORKOUT_DELTA,
  compactEvidence,
  decisionEvidenceChanged,
  effectsAreMaterial,
  evidenceFromProposalPayload,
  evidenceScope,
  isAthleteHumanDecision,
  isProposalSuppressed,
  latestAthleteDecision,
  mapInterventionDecision,
  mapInterventionKind,
  mapSoloProposalTarget,
  mapSoloReviewDecision,
  proposalMateriallyEdited,
  snapshotReviewAggregates,
  weeklyReviewAggregatesFromCounts,
} from '../../../../supabase/functions/_shared/proposalMemory.ts';

export function canRecordAthleteDecision(input: {
  actorId: string | null | undefined;
  athleteId: string;
  isCoachOfAthlete: boolean;
}): boolean {
  return canMutateAthleteSignal(input);
}

export function canReadAthleteDecisionLog(input: {
  actorId: string | null | undefined;
  athleteId: string;
  isCoachOfAthlete: boolean;
}): boolean {
  return canRecordAthleteDecision(input);
}
