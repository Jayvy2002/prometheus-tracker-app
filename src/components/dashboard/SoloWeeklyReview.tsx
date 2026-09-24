import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Flame, Minus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useWeightStore } from '../../stores/weightStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import { useCheckinStore } from '../../stores/checkinStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { useSoloCopilotStore } from '../../stores/soloCopilotStore';
import { supabase } from '../../lib/supabase';
import { isCoachedAthlete } from '../../lib/coachRole';
import { profileHasMedicalFlags } from '../../lib/kinesiologyIntake';
import { getAge } from '../../lib/utils';
import { MIN_LOGGED_DAYS_FOR_GAP } from '../../lib/clientHome';
import {
  SOLO_REVIEW_WINDOW_DAYS,
  computeSoloWeeklyReview,
  soloReviewHasAnyData,
  soloReviewMessageKey,
  type SoloReviewDecision,
} from '../../lib/soloCopilot';
import { listAthleteDecisionLogBestEffort } from '../../features/signals/domain/decisionLogApi';
import { loadWeeklyReviewMemory, persistAthleteWeeklyReviewCycle } from '../../features/signals/domain/weeklyReviewCycle';
import { weeklyReviewInputFromSolo } from '../../features/signals/domain/weeklyReview';
import type { AthleteDecisionLog } from '../../lib/types';
import { addDaysToDateStr, formatNumber, formatSignedNumber, todayStr } from '../../lib/utils';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';

/**
 * The solo's copilot, weekly: reads his own 14 days (logs, weigh-ins, sessions), applies the same
 * rules as the coach fleet, explains the why, and lets him accept or keep. Never shown to a
 * coached client (their coach receives the proposal). Professional capability is independent.
 */
export default function SoloWeeklyReview() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const coached = isCoachedAthlete(coachingRole, myCoach);
  const { measurements } = useWeightStore();
  const { workouts } = useWorkoutStore();
  const { fetchCaloriesForRange } = useNutritionStore();
  const { checkins } = useCheckinStore();
  const { decidedWeek, decidedFor, fetchDecision, decide } = useSoloCopilotStore();
  const [logs, setLogs] = useState<Array<{ logged_at: string; calories: number }> | null>(null);
  const [targetHistory, setTargetHistory] = useState<Array<{ effective_from: string; calories: number }>>([]);
  const [decisions, setDecisions] = useState<AthleteDecisionLog[] | null>(null);
  const [deciding, setDeciding] = useState<SoloReviewDecision | null>(null);

  const solo = !coached;
  const today = todayStr();
  // I03 : 14 dates incluses comme la fleet (today-13..today).
  const windowStart = addDaysToDateStr(today, -(SOLO_REVIEW_WINDOW_DAYS - 1));

  useEffect(() => {
    if (!user || !solo) return;
    let cancelled = false;
    void fetchCaloriesForRange(user.id, windowStart, today)
      .then(rows => {
        if (!cancelled) setLogs(rows.map(r => ({ logged_at: r.logged_at, calories: r.calories })));
      })
      .catch(() => {
        if (!cancelled) setLogs([]);
      });
    // I03 : historique daté des cibles — chaque jour jugé contre sa cible.
    void supabase
      .from('nutrition_target_history')
      .select('effective_from, calories')
      .eq('user_id', user.id)
      .lte('effective_from', today)
      .order('effective_from', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!cancelled && data) {
          setTargetHistory((data as Array<{ effective_from: string; calories: number }>)
            .filter(r => Number.isFinite(Number(r.calories)))
            .map(r => ({ effective_from: r.effective_from.slice(0, 10), calories: Number(r.calories) })));
        }
      });
    void listAthleteDecisionLogBestEffort(user.id).then(rows => {
      if (!cancelled) setDecisions(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, solo, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const review = useMemo(() => {
    if (!solo || !profile || !logs || !decisions) return null;
    return computeSoloWeeklyReview({
      today,
      goal: profile.goal ?? 'maintain',
      calorieTarget: profile.daily_calorie_target ?? 0,
      proteinTarget: profile.protein_target ?? 0,
      carbsTarget: profile.carbs_target ?? 0,
      fatTarget: profile.fat_target ?? 0,
      weightKg: profile.weight_kg ?? 0,
      trainingFrequency: profile.training_frequency ?? 0,
      nutritionLogs: logs,
      weights: measurements,
      workouts,
      checkins,
      targetHistory,
      // I04 : accompagnement général pour ces profils, jamais d'objectif auto.
      isMinor: !!profile.date_of_birth && getAge(profile.date_of_birth) < 18,
      hasMedicalFlags: profileHasMedicalFlags(profile.kinesiology_intake),
      recentDecisions: decisions,
    });
  }, [solo, profile, logs, decisions, measurements, workouts, checkins, targetHistory, today]);

  const persistVersion = [
    user?.id,
    solo,
    profile?.goal,
    profile?.daily_calorie_target,
    profile?.training_frequency,
    profile?.protein_target,
    profile?.carbs_target,
    profile?.fat_target,
    review?.weekStart,
    review?.evidence.windowStart,
    review?.evidence.windowEnd,
    review?.evidence.loggedDays,
    review?.evidence.avgCalories,
    review?.evidence.targetAvg,
    review?.evidence.workouts,
    review?.evidence.expectedWorkouts,
    review?.evidence.weighIns,
    review?.evidence.deltaKg,
    review?.evidence.avgFatigue,
    review?.evidence.avgEnergy,
    measurements.length,
    workouts.length,
    checkins.length,
    logs?.length ?? 0,
    targetHistory.length,
    decisions?.length ?? 0,
  ].join('|');

  useEffect(() => {
    if (!user || !review) return;
    if (decidedFor === user.id && decidedWeek === review.weekStart) return;
    void fetchDecision(user.id, review.weekStart);
  }, [user?.id, review?.weekStart, decidedFor, decidedWeek, fetchDecision]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || !solo || !profile || !review) return;
    let cancelled = false;
    void (async () => {
      const memory = await loadWeeklyReviewMemory(user.id);
      if (cancelled) return;
      const result = await persistAthleteWeeklyReviewCycle(weeklyReviewInputFromSolo(
        {
          today,
          goal: profile.goal ?? 'maintain',
          calorieTarget: profile.daily_calorie_target ?? 0,
          trainingFrequency: profile.training_frequency ?? 0,
          isMinor: !!profile.date_of_birth && getAge(profile.date_of_birth) < 18,
          hasMedicalFlags: profileHasMedicalFlags(profile.kinesiology_intake),
          tracking: { nutrition: true, workouts: true, weight: true, checkins: true },
        },
        {
          windowStart: review.evidence.windowStart,
          windowEnd: review.evidence.windowEnd,
          loggedDays: review.evidence.loggedDays,
          avgCalories: review.evidence.avgCalories,
          targetAvg: review.evidence.targetAvg,
          weighIns: review.evidence.weighIns,
          weightStart: review.evidence.weightStart,
          deltaKg: review.evidence.deltaKg,
          weightSpanDays: review.evidence.weightSpanDays,
          workouts: review.evidence.workouts,
          expectedWorkouts: review.evidence.expectedWorkouts,
          avgFatigue: review.evidence.avgFatigue,
          avgEnergy: review.evidence.avgEnergy,
          checkinCount: checkins.filter(row => row.checked_at.slice(0, 10) >= windowStart).length,
        },
        memory.existingSignals,
        user.id,
        memory.recentDecisions,
      ));
      if (cancelled) return;
      if (result.error) toast(t('soloReview.persistFailed'), 'error');
    })();
    return () => {
      cancelled = true;
    };
  }, [persistVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user || !solo || !review) return null;
  if (decidedFor === user.id && decidedWeek === review.weekStart) return null;
  if (review.status === 'insufficient' && !soloReviewHasAnyData(review.evidence)) return null;

  const { proposal, evidence } = review;
  const draft = proposal.draft;
  const messageKey = soloReviewMessageKey(review);
  const delta = evidence.deltaKg;
  const deltaLabel = delta == null ? '—' : formatSignedNumber(delta, { maxDigits: 1 });
  const pct = evidence.ratio > 0 ? Math.round(evidence.ratio * 100) : null;
  const pctWeek = evidence.pctPerWeek == null ? '—' : formatNumber(Math.abs(evidence.pctPerWeek), { minDigits: 1 });

  const message = t(messageKey, {
    delta: deltaLabel,
    pct: pct ?? '—',
    pctWeek,
    avg: evidence.avgCalories,
    loggedDays: evidence.loggedDays,
    window: SOLO_REVIEW_WINDOW_DAYS,
    from: review.currentCalories,
    to: draft?.calories ?? review.currentCalories,
    carbs: draft?.carbs ?? 0,
  });

  const tone = proposal.action === 'calorie_adjustment'
    ? 'border-blue-500/30 bg-blue-500/5'
    : proposal.action === 'relance'
      ? 'border-amber-500/30 bg-amber-500/5'
      : 'border-emerald-500/30 bg-emerald-500/5';
  const TrendIcon = delta == null || Math.abs(delta) < 0.05 ? Minus : delta > 0 ? TrendingUp : TrendingDown;

  const onDecide = async (decision: SoloReviewDecision) => {
    if (deciding) return;
    setDeciding(decision);
    const result = await decide(user.id, review, decision);
    setDeciding(null);
    if (result.error) {
      toast(result.error, 'error');
      return;
    }
    if (decision === 'accepted' && draft) toast(t('soloReview.applied', { n: draft.calories }));
  };

  return (
    <div className={`mb-4 rounded-2xl border p-4 animate-fade-in-scale ${tone}`}>
      <p className="text-[11px] uppercase tracking-wider text-neutral-400 flex items-center gap-1.5 mb-2">
        <Sparkles size={12} className="text-blue-300" /> {t('soloReview.title')}
      </p>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0 text-neutral-300">
          <TrendIcon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white leading-snug whitespace-pre-line">{message}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-2">
              <p className="text-[10px] text-neutral-500 flex items-center gap-1">
                <Flame size={10} className="text-orange-400" aria-hidden="true" />
                {draft ? t('soloReview.statKcalTarget') : t('soloReview.statKcal')}
              </p>
              <p className="text-sm font-bold text-white">
                {draft
                  ? formatNumber(draft.calories, { maxDigits: 0 })
                  : evidence.loggedDays >= MIN_LOGGED_DAYS_FOR_GAP ? formatNumber(evidence.avgCalories, { maxDigits: 0 }) : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-2">
              <p className="text-[10px] text-neutral-500">{t('soloReview.statWeight')}</p>
              <p className="text-sm font-bold text-white">{deltaLabel}</p>
            </div>
            <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-2">
              <p className="text-[10px] text-neutral-500">{t('soloReview.statSessions')}</p>
              <p className="text-sm font-bold text-white">{evidence.workouts}</p>
            </div>
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">
            {t('soloReview.statWindow', { days: SOLO_REVIEW_WINDOW_DAYS, count: evidence.loggedDays })} {t('soloReview.nothingAuto')}
          </p>
        </div>
      </div>

      {review.status === 'ready' && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {draft && !review.suppressedByDecision ? (
            <>
              <Button variant="secondary" size="sm" loading={deciding === 'kept'} onClick={() => void onDecide('kept')}>
                {t('soloReview.keepMine')}
              </Button>
              <Button size="sm" loading={deciding === 'accepted'} onClick={() => void onDecide('accepted')}>
                <Check size={14} /> {t('soloReview.apply', { n: draft.calories })}
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" loading={deciding === 'kept'} onClick={() => void onDecide('kept')}>
              {t('soloReview.gotIt')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
