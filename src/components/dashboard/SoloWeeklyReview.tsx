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
import { isCoachedAthlete } from '../../lib/coachRole';
import {
  SOLO_REVIEW_WINDOW_DAYS,
  computeSoloWeeklyReview,
  soloReviewHasAnyData,
  soloReviewMessageKey,
  type SoloReviewDecision,
} from '../../lib/soloCopilot';
import { addDaysToDateStr, todayStr } from '../../lib/utils';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';

/**
 * The solo's copilot, weekly: reads his own 14 days (logs, weigh-ins, sessions), applies the same
 * rules as the coach fleet, explains the why, and lets him accept or keep. Never shown to a
 * coached client (his coach receives the proposal) nor to a coach.
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
  const [deciding, setDeciding] = useState<SoloReviewDecision | null>(null);

  const solo = !coached && coachingRole !== 'coach';
  const today = todayStr();

  useEffect(() => {
    if (!user || !solo) return;
    let cancelled = false;
    void fetchCaloriesForRange(user.id, addDaysToDateStr(today, -SOLO_REVIEW_WINDOW_DAYS), today)
      .then(rows => {
        if (!cancelled) setLogs(rows.map(r => ({ logged_at: r.logged_at, calories: r.calories })));
      })
      .catch(() => {
        if (!cancelled) setLogs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, solo, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const review = useMemo(() => {
    if (!solo || !profile || !logs) return null;
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
    });
  }, [solo, profile, logs, measurements, workouts, checkins, today]);

  useEffect(() => {
    if (!user || !review) return;
    if (decidedFor === user.id && decidedWeek === review.weekStart) return;
    void fetchDecision(user.id, review.weekStart);
  }, [user?.id, review?.weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user || !solo || !review) return null;
  if (decidedFor === user.id && decidedWeek === review.weekStart) return null;
  if (review.status === 'insufficient' && !soloReviewHasAnyData(review.evidence)) return null;

  const { proposal, evidence } = review;
  const draft = proposal.draft;
  const messageKey = soloReviewMessageKey(review);
  const delta = evidence.deltaKg;
  const deltaLabel = delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;
  const pct = evidence.ratio > 0 ? Math.round(evidence.ratio * 100) : null;
  const pctWeek = evidence.pctPerWeek == null ? '—' : Math.abs(evidence.pctPerWeek).toFixed(1);

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
          {draft && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-2">
                <p className="text-[10px] text-neutral-500 flex items-center gap-1"><Flame size={10} className="text-orange-400" /> kcal</p>
                <p className="text-sm font-bold text-white">{draft.calories}</p>
              </div>
              <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-2">
                <p className="text-[10px] text-neutral-500">{t('common.protein')}</p>
                <p className="text-sm font-bold text-sky-300">{draft.protein}<span className="text-[10px] text-neutral-500 ml-0.5">g</span></p>
              </div>
              <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-2">
                <p className="text-[10px] text-neutral-500">{t('common.carbs')}</p>
                <p className="text-sm font-bold text-amber-300">{draft.carbs}<span className="text-[10px] text-neutral-500 ml-0.5">g</span></p>
              </div>
              <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-2">
                <p className="text-[10px] text-neutral-500">{t('common.fat')}</p>
                <p className="text-sm font-bold text-rose-300">{draft.fat}<span className="text-[10px] text-neutral-500 ml-0.5">g</span></p>
              </div>
            </div>
          )}
          {review.status === 'ready' && (
            <p className="text-[11px] text-neutral-500 mt-2">
              {t('soloReview.evidence', {
                weighIns: evidence.weighIns,
                start: evidence.weightStart?.toFixed(1) ?? '—',
                end: evidence.weightEnd?.toFixed(1) ?? '—',
                loggedDays: evidence.loggedDays,
                window: SOLO_REVIEW_WINDOW_DAYS,
                avg: evidence.avgCalories,
                workouts: evidence.workouts,
              })}
            </p>
          )}
          <p className="text-[11px] text-neutral-500 mt-1">{t('soloReview.nothingAuto')}</p>
        </div>
      </div>

      {review.status === 'ready' && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {draft ? (
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
