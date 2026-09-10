import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { track } from '../lib/telemetryClient';
import { useProfileStore } from './profileStore';
import type { SoloReviewDecision, SoloWeeklyReview } from '../lib/soloCopilot';
import type { SoloWeeklyReviewRow } from '../lib/types';

interface SoloCopilotState {
  /** week_start of the review the solo already decided on (null = nothing yet this week). */
  decidedWeek: string | null;
  decidedFor: string | null;
  loading: boolean;
  fetchDecision: (userId: string, weekStart: string) => Promise<void>;
  decide: (userId: string, review: SoloWeeklyReview, decision: SoloReviewDecision) => Promise<{ error: string | null }>;
  clear: () => void;
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
    const { error } = await supabase
      .from('solo_weekly_reviews')
      .upsert({
        user_id: userId,
        week_start: review.weekStart,
        action: review.proposal.action,
        reason: review.proposal.reason,
        proposed: draft ?? {},
        evidence: {
          logged_days: review.evidence.loggedDays,
          avg_calories: review.evidence.avgCalories,
          ratio: Math.round(review.evidence.ratio * 100) / 100,
          weigh_ins: review.evidence.weighIns,
          delta_kg: review.evidence.deltaKg,
          pct_per_week: review.evidence.pctPerWeek,
          workouts: review.evidence.workouts,
          following_plan: review.evidence.followingPlan,
        },
        decision,
        decided_at: new Date().toISOString(),
      }, { onConflict: 'user_id,week_start' });
    track('solo_review_decided', {
      action: review.proposal.action,
      reason: review.proposal.reason,
      decision,
      from_kcal: review.currentCalories,
      to_kcal: draft?.calories ?? null,
    });
    if (error) return { error: error.message };
    set({ decidedWeek: review.weekStart, decidedFor: userId });
    return { error: null };
  },

  clear: () => set({ decidedWeek: null, decidedFor: null, loading: false }),
}));
