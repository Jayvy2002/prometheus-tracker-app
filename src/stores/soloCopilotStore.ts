import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { track } from '../lib/telemetryClient';
import { useProfileStore } from './profileStore';
import type { SoloReviewDecision, SoloWeeklyReview } from '../lib/soloCopilot';
import type { SoloWeeklyReviewRow } from '../lib/types';
import { isMissingBackendContract } from '../features/signals/domain/backendContract';
import { recordAthleteDecisionDurable } from '../features/signals/domain/decisionLogApi';
import { mapSoloProposalTarget, mapSoloReviewDecision } from '../features/signals/domain/decisionLog';

interface SoloCopilotState {
  /** week_start of the review the solo already decided on (null = nothing yet this week). */
  decidedWeek: string | null;
  decidedFor: string | null;
  loading: boolean;
  fetchDecision: (userId: string, weekStart: string) => Promise<void>;
  decide: (userId: string, review: SoloWeeklyReview, decision: SoloReviewDecision) => Promise<{ error: string | null }>;
  clear: () => void;
}

function journalFields(userId: string, review: SoloWeeklyReview, decision: SoloReviewDecision) {
  const draft = review.proposal.draft;
  const target = mapSoloProposalTarget(review.proposal.action, review.proposal.reason);
  const human = mapSoloReviewDecision(decision);
  return {
    target,
    human,
    proposal: {
      action: review.proposal.action,
      reason: review.proposal.reason,
      draft: draft ?? {},
      week_start: review.weekStart,
    },
    dataUsed: {
      avg_calories: review.evidence.avgCalories,
      calorie_target: review.evidence.targetAvg,
      workout_count: review.evidence.workouts,
      logged_nutrition_days: review.evidence.loggedDays,
      weight_delta_kg: review.evidence.deltaKg,
    },
    appliedEffect: human === 'accepted' && draft
      ? {
        daily_calorie_target: draft.calories,
        protein_target: draft.protein,
        carbs_target: draft.carbs,
        fat_target: draft.fat,
      }
      : {},
    soloRow: {
      user_id: userId,
      week_start: review.weekStart,
      action: review.proposal.action,
      reason: review.proposal.reason,
      proposed: draft ?? {},
      evidence: {
        logged_days: review.evidence.loggedDays,
        avg_calories: review.evidence.avgCalories,
        target_avg: review.evidence.targetAvg,
        ratio: Math.round(review.evidence.ratio * 100) / 100,
        weigh_ins: review.evidence.weighIns,
        delta_kg: review.evidence.deltaKg,
        span_days: review.evidence.weightSpanDays,
        pct_per_week: review.evidence.pctPerWeek,
        workouts: review.evidence.workouts,
        following_plan: review.evidence.followingPlan,
        guarded: review.proposal.guarded === true,
      },
      decision,
      decided_at: new Date().toISOString(),
    },
  };
}

export const useSoloCopilotStore = create<SoloCopilotState>((set) => ({
  decidedWeek: null,
  decidedFor: null,
  loading: false,

  fetchDecision: async (userId, weekStart) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('solo_weekly_reviews')
      .select('week_start')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .maybeSingle();
    if (error) {
      // Table missing or offline: stay silent rather than nag; the card simply shows again.
      set({ loading: false, decidedWeek: null, decidedFor: userId });
      return;
    }
    set({
      loading: false,
      decidedWeek: (data as Pick<SoloWeeklyReviewRow, 'week_start'> | null)?.week_start ?? null,
      decidedFor: userId,
    });
  },

  decide: async (userId, review, decision) => {
    const draft = review.proposal.draft;
    if (decision === 'accepted' && draft) {
      // The only write path to the solo's targets from the copilot: his explicit tap.
      // D03 : si les cibles n'ont pas été écrites, on n'enregistre PAS la décision.
      const saved = await useProfileStore.getState().updateProfile(userId, {
        daily_calorie_target: draft.calories,
        protein_target: draft.protein,
        carbs_target: draft.carbs,
        fat_target: draft.fat,
      });
      if (saved.error) return { error: saved.error };
    }
    const fields = journalFields(userId, review, decision);
    const committed = await supabase.rpc('commit_solo_weekly_review_decision', {
      p_week_start: review.weekStart,
      p_action: review.proposal.action,
      p_reason: review.proposal.reason,
      p_proposed: fields.soloRow.proposed,
      p_evidence: fields.soloRow.evidence,
      p_decision: decision,
      p_domain: fields.target.domain,
      p_type: fields.target.type,
      p_proposal: fields.proposal,
      p_why: review.proposal.reason,
      p_data_used: fields.dataUsed,
      p_applied_effect: fields.appliedEffect,
    });
    if (committed.error && !isMissingBackendContract(committed.error)) {
      return { error: committed.error.message };
    }
    if (committed.error) {
      const { error } = await supabase
        .from('solo_weekly_reviews')
        .upsert(fields.soloRow, { onConflict: 'user_id,week_start' });
      if (error) return { error: error.message };
      await recordAthleteDecisionDurable({
        athleteId: userId,
        domain: fields.target.domain,
        type: fields.target.type,
        decision: fields.human,
        proposal: fields.proposal,
        why: review.proposal.reason,
        dataUsed: fields.dataUsed,
        appliedEffect: fields.appliedEffect,
        source: 'solo_weekly_reviews',
      });
    }
    track('solo_review_decided', {
      action: review.proposal.action,
      reason: review.proposal.reason,
      decision,
      from_kcal: review.currentCalories,
      to_kcal: draft?.calories ?? null,
    });
    set({ decidedWeek: review.weekStart, decidedFor: userId });
    return { error: null };
  },

  clear: () => set({ decidedWeek: null, decidedFor: null, loading: false }),
}));
