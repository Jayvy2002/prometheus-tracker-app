import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Flame, Droplets, Dumbbell, TrendingUp, Footprints, ChevronRight, Play, Scale, AlertCircle, Battery, X, ClipboardCheck, MessageSquare } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import { useWeightStore } from '../../stores/weightStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useStreakStore } from '../../stores/streakStore';
import { useRoutineStore } from '../../stores/routineStore';
import { useCheckinStore } from '../../stores/checkinStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { useProgramStore } from '../../stores/programStore';
import { startWorkoutFromTemplate } from '../../lib/startWorkout';
import { todayStr, toLocalDateStr, kgToLbs, programWeekNumber, formatWeekdayDate } from '../../lib/utils';
import { useClientTracking } from '../../lib/useClientTracking';
import { showModule, showNutritionField } from '../../lib/clientTracking';
import { isCoachedAthlete } from '../../lib/coachRole';
import {
  clientHomeNextAction,
  daysSinceActivity,
  isClientFirstRun,
  shouldShowDaysSinceReminder,
} from '../../lib/clientHome';
import { resolveClientGymCard } from '../../lib/clientGym';
import type { ProgramDay } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import ProgressRing from '../ui/ProgressRing';
import PageTransition from '../ui/PageTransition';
import ClientGymCard from './ClientGymCard';

function getWeekDates(): string[] {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toLocalDateStr(d);
  });
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const { logs, waterLogs, fetchLogs, fetchWaterLogs } = useNutritionStore();
  const { measurements, fetchMeasurements } = useWeightStore();
  const { workouts, fetchWorkouts, loading: workoutsLoading } = useWorkoutStore();
  const { streak, fetchStreak } = useStreakStore();
  const { routines, fetchRoutines, fetchRoutineWithExercises } = useRoutineStore();
  const { todayCheckin, checkins, fetchToday, fetchRecent, loading: checkinLoading } = useCheckinStore();
  const { myCoach, coachingRole, latestCoachMessage, unreadMessageCount, fetchMyCoach, markCoachMessageRead } = useCoachingStore();
  const { assignment, fetchMyAssignment } = useProgramStore();
  const tracking = useClientTracking();
  const [startingRoutine, setStartingRoutine] = useState(false);
  const [dismissedReminders, setDismissedReminders] = useState<string[]>([]);
  const [nutritionHistoryCount, setNutritionHistoryCount] = useState<number | null>(null);
  const [assignmentReady, setAssignmentReady] = useState(false);

  const dismissReminder = (key: string) => {
    setDismissedReminders(prev => [...prev, key]);
  };

  useEffect(() => {
    if (!user) return;
    const today = todayStr();
    fetchLogs(user.id, today);
    fetchWaterLogs(user.id, today);
    fetchMeasurements(user.id);
    fetchWorkouts(user.id);
    fetchStreak(user.id);
    fetchRoutines(user.id);
    fetchToday(user.id);
    fetchRecent(user.id, 14);
    fetchMyCoach();
    setAssignmentReady(false);
    void fetchMyAssignment(user.id).finally(() => setAssignmentReady(true));
    void supabase
      .from('nutrition_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count }) => setNutritionHistoryCount(count ?? 0));
  }, [user]);

  const firstName = profile?.full_name?.split(' ')[0] || '';
  const hour = new Date().getHours();
  const timeKey = hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening';
  const greeting = `${t(`dashboard.${timeKey}`)}${firstName ? `, ${firstName}` : ''} !`;

  // Daily metrics
  const calorieTarget = profile?.daily_calorie_target ?? 2000;
  const consumed = logs.reduce((sum, l) => sum + l.calories, 0);
  const caloriePct = Math.min(100, (consumed / calorieTarget) * 100);

  const waterTarget = profile?.daily_water_target_ml ?? 2500;
  const waterConsumed = waterLogs.reduce((sum, l) => sum + l.amount_ml, 0);
  const waterPct = Math.min(100, (waterConsumed / waterTarget) * 100);

  const proteinTarget = profile?.protein_target ?? 150;
  const proteinConsumed = logs.reduce((sum, l) => sum + l.protein, 0);
  const proteinPct = Math.min(100, (proteinConsumed / proteinTarget) * 100);

  const carbsTarget = profile?.carbs_target ?? 250;
  const carbsConsumed = logs.reduce((sum, l) => sum + (l.carbs ?? 0), 0);
  const carbsPct = Math.min(100, (carbsConsumed / carbsTarget) * 100);

  const fatTarget = profile?.fat_target ?? 70;
  const fatConsumed = logs.reduce((sum, l) => sum + (l.fat ?? 0), 0);
  const fatPct = Math.min(100, (fatConsumed / fatTarget) * 100);

  // Weekly workout goal
  const weekDates = getWeekDates();
  const todayIndex = weekDates.indexOf(todayStr());
  const trainingTarget = profile?.training_frequency ?? 3;
  const doneDays = weekDates.map(date =>
    workouts.some(w => w.completed && w.date?.startsWith(date))
  );
  const weekWorkoutsDone = doneDays.filter(Boolean).length;
  const weekGoalMet = weekWorkoutsDone >= trainingTarget;

  // Streak
  const currentStreak = streak?.current_streak ?? 0;
  const longestStreak = streak?.longest_streak ?? 0;

  // Weight mini trend (last 7)
  const recentWeights = [...measurements]
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
    .slice(-7);
  const weightUnit = profile?.unit_weight ?? 'kg';
  const latestWeight = recentWeights.length > 0
    ? weightUnit === 'lbs'
      ? kgToLbs(recentWeights[recentWeights.length - 1].weight_kg)
      : +recentWeights[recentWeights.length - 1].weight_kg
    : null;
  const weightDelta = recentWeights.length >= 2
    ? +(recentWeights[recentWeights.length - 1].weight_kg - recentWeights[0].weight_kg).toFixed(1)
    : null;

  const todayDow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
  const alreadyTrainedToday = doneDays[todayIndex];
  const hasProgram = !!assignment?.program && assignment.status === 'active';
  const gymCard = resolveClientGymCard({
    hasActiveProgram: hasProgram,
    days: assignment?.program?.days,
    workouts,
    todayWeekday: new Date().getDay(),
    todayDate: todayStr(),
    assignmentId: assignment?.id ?? null,
  });
  const programWeek = assignment?.program
    ? programWeekNumber(assignment.start_date, assignment.program.duration_weeks)
    : null;
  const scheduledToday = !alreadyTrainedToday
    ? routines.find(r => r.scheduled_days?.includes(todayDow))
    : null;
  const nextRoutine = !hasProgram && gymCard.kind === 'none'
    ? (scheduledToday || (!alreadyTrainedToday && routines.length > 0 ? routines[0] : null))
    : null;

  const completedWorkoutCount = workouts.filter(w => w.completed).length;
  const checkinCount = Math.max(checkins.length, todayCheckin ? 1 : 0);
  const lastCompletedWorkout = [...workouts]
    .filter(w => w.completed && w.date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastCheckin = todayCheckin ?? checkins[0] ?? null;
  const activityPending = !!user && (nutritionHistoryCount === null || workoutsLoading || checkinLoading || !assignmentReady);
  const firstRun = !activityPending && isClientFirstRun({
    completedWorkoutCount,
    nutritionLogCount: (nutritionHistoryCount ?? 0) + logs.length,
    checkinCount,
    lastWorkoutAt: lastCompletedWorkout?.date ?? null,
    lastNutritionAt: logs[0]?.logged_at ?? null,
    lastCheckinAt: lastCheckin?.checked_at ?? null,
  });
  const calmHome = activityPending || firstRun;
  const hasGymCard = showModule(tracking, 'workouts') && gymCard.kind !== 'none';
  const hasNextWorkout = hasGymCard || (!!nextRoutine && showModule(tracking, 'workouts'));
  const hasCoach = isCoachedAthlete(coachingRole, myCoach);
  const nextAction = clientHomeNextAction({
    firstRun,
    hasProgram,
    hasNextWorkout,
    checkinsEnabled: showModule(tracking, 'checkins'),
    todayCheckinDone: !!todayCheckin,
    hasCoach,
  });

  // Reminders — never from null / epoch-zero (that used to render « 999 days »)
  const lastWeighIn = measurements.length > 0
    ? [...measurements].sort((a, b) => b.measured_at.localeCompare(a.measured_at))[0]
    : null;
  const daysSinceWeighIn = daysSinceActivity(lastWeighIn?.measured_at);
  const showWeightReminder = !calmHome && shouldShowDaysSinceReminder(daysSinceWeighIn);

  const hourNow = new Date().getHours();
  const hasLoggedLunch = logs.some(l => l.category === 'lunch');
  const showMealReminder = !calmHome && (
    (hourNow >= 13 && hourNow <= 16 && !hasLoggedLunch && consumed === 0) ||
    (hourNow >= 13 && !hasLoggedLunch && consumed < calorieTarget * 0.3)
  );

  const showWaterReminder = !calmHome && hourNow >= 15 && waterConsumed > 0 && waterPct < 50;

  // Deload suggestion — if trained 4+ consecutive weeks without a break
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const recentCompletedWorkouts = workouts.filter(w => w.completed && new Date(w.date) >= fourWeeksAgo);
  const weeksWithWorkouts = new Set(recentCompletedWorkouts.map(w => {
    const d = new Date(w.date);
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    return Math.floor((d.getTime() - startOfYear.getTime()) / (7 * 86400000));
  }));
  const showDeloadSuggestion = weeksWithWorkouts.size >= 4 && recentCompletedWorkouts.length >= 12;

  const startProgramDay = async (day: ProgramDay) => {
    if (!user || startingRoutine || !assignment?.program) return;
    setStartingRoutine(true);
    try {
      const workoutId = await startWorkoutFromTemplate({
        userId: user.id,
        name: day.name || assignment.program.name,
        programAssignmentId: assignment.id,
        programDayId: day.id,
        exercises: (day.exercises ?? []).map(ex => ({
          name: ex.name,
          default_sets: ex.default_sets,
          default_reps: ex.default_reps,
          default_reps_min: ex.default_reps_min,
          default_rir: ex.default_rir,
          default_rest_seconds: ex.default_rest_seconds,
          default_weight_kg: ex.default_weight_kg,
          order_index: ex.order_index,
        })),
      });
      if (workoutId) navigate(`/workout/${workoutId}`);
    } finally {
      setStartingRoutine(false);
    }
  };

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 animate-fade-in-down">
          <button
            onClick={() => navigate('/profile')}
            className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-neutral-800 hover:ring-blue-500 transition-all active:scale-95"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-blue-600/20 flex items-center justify-center text-blue-400 text-sm font-bold">
                {firstName[0]?.toUpperCase() || 'U'}
              </div>
            )}
          </button>
          <div className="flex-1">
            <p className="text-neutral-400 text-xs">
              {formatWeekdayDate(new Date(), i18n.language)}
            </p>
            <p className="text-sm font-medium text-white leading-snug">{greeting}</p>
            {myCoach && (
              <p className="text-[11px] text-blue-400/80 mt-0.5">
                {t('coaching.coachedBy', { name: myCoach.full_name || t('coaching.invite.aCoach') })}
              </p>
            )}
          </div>
        </div>

        {hasGymCard && assignment?.program && (
          <ClientGymCard
            card={gymCard}
            programName={assignment.program.name}
            programWeek={programWeek}
            durationWeeks={assignment.program.duration_weeks}
            starting={startingRoutine}
            onStart={startProgramDay}
            onContinue={workoutId => navigate(`/workout/${workoutId}`)}
          />
        )}

        {showModule(tracking, 'workouts') && nextRoutine && (
          <button
            type="button"
            disabled={startingRoutine}
            onClick={async () => {
              if (!user || startingRoutine) return;
              setStartingRoutine(true);
              try {
                const routine = await fetchRoutineWithExercises(nextRoutine.id);
                if (!routine) return;
                const workoutId = await startWorkoutFromTemplate({
                  userId: user.id,
                  name: routine.name,
                  routineId: nextRoutine.id,
                  exercises: (routine.exercises ?? []).map(ex => ({
                    name: ex.name,
                    default_sets: ex.default_sets,
                    default_reps: ex.default_reps,
                    order_index: ex.order_index,
                  })),
                });
                if (workoutId) navigate(`/workout/${workoutId}`);
              } finally {
                setStartingRoutine(false);
              }
            }}
            className="w-full bg-gradient-to-r from-blue-600/20 to-blue-500/5 border border-blue-500/30 rounded-2xl p-4 mb-4 text-left hover:border-blue-500/50 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                <Play size={18} className="text-blue-400 ml-0.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-blue-400 font-medium">{t('dashboard.nextWorkout')}</p>
                <p className="text-sm font-semibold text-white truncate">{nextRoutine.name}</p>
                {nextRoutine.exercises && (
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {nextRoutine.exercises.length} {t('dashboard.exercises')}
                  </p>
                )}
              </div>
              <span className="text-xs font-semibold text-blue-300 flex items-center gap-0.5 shrink-0">
                {t('dashboard.gym.startCta')}
                <ChevronRight size={16} />
              </span>
            </div>
          </button>
        )}

        {myCoach && (hasProgram || (!calmHome && showNutritionField(tracking, 'calories'))) && (
          <div className="rounded-xl bg-neutral-900/60 border border-neutral-800 px-3.5 py-2.5 mb-4 text-xs text-neutral-300 space-y-0.5">
            {assignment?.program && (
              <p>{t('coaching.loop.program', { name: assignment.program.name })}</p>
            )}
            {!calmHome && showNutritionField(tracking, 'calories') && (
              <p>{t('coaching.loop.calories', { n: calorieTarget })}</p>
            )}
          </div>
        )}

        {myCoach && (latestCoachMessage || unreadMessageCount > 0) && (
          <button
            type="button"
            onClick={() => navigate('/messages')}
            className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/25 rounded-xl px-3.5 py-2.5 mb-4 w-full text-left"
          >
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <MessageSquare size={14} className="text-blue-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-blue-300 mb-0.5">
                {t('dashboard.coachMessageTitle')}
                {unreadMessageCount > 1 ? ` · ${unreadMessageCount}` : ''}
              </p>
              <p className="text-xs text-blue-100/90 whitespace-pre-wrap line-clamp-3">
                {latestCoachMessage?.body || t('coaching.messages.openInbox')}
              </p>
            </div>
            <span
              role="button"
              tabIndex={0}
              onClick={e => {
                e.stopPropagation();
                if (latestCoachMessage) void markCoachMessageRead(latestCoachMessage.id);
              }}
              className="p-1 rounded-md hover:bg-blue-500/10 text-blue-400/60 hover:text-blue-200 transition-colors shrink-0"
            >
              <X size={14} />
            </span>
          </button>
        )}

        {/* Notification Reminders */}
        {(showWeightReminder || showMealReminder || showWaterReminder || showDeloadSuggestion) && (
          <div className="space-y-2 mb-4 animate-fade-in-down" style={{ animationDelay: '100ms' }}>
            {showDeloadSuggestion && !dismissedReminders.includes('deload') && (
              <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3.5 py-2.5 backdrop-blur-sm">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                  <Battery size={14} className="text-amber-400" />
                </div>
                <button onClick={() => navigate('/workout')} className="flex-1 text-left">
                  <p className="text-xs font-medium text-amber-200/90 leading-snug">{t('dashboard.reminders.deload')}</p>
                </button>
                <button onClick={() => dismissReminder('deload')} className="p-1 rounded-md hover:bg-amber-500/10 text-amber-400/60 hover:text-amber-300 transition-colors shrink-0">
                  <X size={14} />
                </button>
              </div>
            )}
            {showModule(tracking, 'weight') && showWeightReminder && !dismissedReminders.includes('weight') && (
              <div className="flex items-center gap-3 bg-blue-500/8 border border-blue-500/20 rounded-xl px-3.5 py-2.5 backdrop-blur-sm">
                <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                  <Scale size={14} className="text-blue-400" />
                </div>
                <button onClick={() => navigate('/weight')} className="flex-1 text-left">
                  <p className="text-xs font-medium text-blue-200/80 leading-snug">{t('dashboard.reminders.weight', { days: daysSinceWeighIn ?? 0 })}</p>
                </button>
                <button onClick={() => dismissReminder('weight')} className="p-1 rounded-md hover:bg-blue-500/10 text-blue-400/60 hover:text-blue-300 transition-colors shrink-0">
                  <X size={14} />
                </button>
              </div>
            )}
            {showNutritionField(tracking, 'calories') && showMealReminder && !dismissedReminders.includes('meal') && (
              <div className="flex items-center gap-3 bg-orange-500/8 border border-orange-500/20 rounded-xl px-3.5 py-2.5 backdrop-blur-sm">
                <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center shrink-0">
                  <AlertCircle size={14} className="text-orange-400" />
                </div>
                <button onClick={() => navigate('/nutrition')} className="flex-1 text-left">
                  <p className="text-xs font-medium text-orange-200/80 leading-snug">{t('dashboard.reminders.meal')}</p>
                </button>
                <button onClick={() => dismissReminder('meal')} className="p-1 rounded-md hover:bg-orange-500/10 text-orange-400/60 hover:text-orange-300 transition-colors shrink-0">
                  <X size={14} />
                </button>
              </div>
            )}
            {showNutritionField(tracking, 'water') && showWaterReminder && !dismissedReminders.includes('water') && (
              <div className="flex items-center gap-3 bg-cyan-500/8 border border-cyan-500/20 rounded-xl px-3.5 py-2.5 backdrop-blur-sm">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/15 flex items-center justify-center shrink-0">
                  <Droplets size={14} className="text-cyan-400" />
                </div>
                <button onClick={() => navigate('/nutrition')} className="flex-1 text-left">
                  <p className="text-xs font-medium text-cyan-200/80 leading-snug">{t('dashboard.reminders.water')}</p>
                </button>
                <button onClick={() => dismissReminder('water')} className="p-1 rounded-md hover:bg-cyan-500/10 text-cyan-400/60 hover:text-cyan-300 transition-colors shrink-0">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {nextAction && (
          nextAction === 'checkin' ? (
            <button
              onClick={() => navigate('/checkin')}
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/60 px-4 py-5 mb-4 text-left hover:border-neutral-700 active:scale-[0.99] transition-all"
            >
              <p className="text-sm text-neutral-200">{t('dashboard.firstRun.checkin')}</p>
            </button>
          ) : nextAction === 'first_session' && showModule(tracking, 'workouts') ? (
            <button
              onClick={() => navigate('/workout')}
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/60 px-4 py-5 mb-4 text-left hover:border-neutral-700 active:scale-[0.99] transition-all"
            >
              <p className="text-sm text-neutral-200">{t('dashboard.firstRun.firstSession')}</p>
            </button>
          ) : (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 px-4 py-5 mb-4">
              <p className="text-sm text-neutral-200">{t(`dashboard.firstRun.${nextAction}`)}</p>
            </div>
          )
        )}

        {showModule(tracking, 'checkins') && !todayCheckin && nextAction !== 'checkin' && (!calmHome || (firstRun && hasNextWorkout)) && (
          <button
            onClick={() => navigate('/checkin')}
            className="w-full flex items-center gap-3 bg-violet-500/10 border border-violet-500/25 rounded-xl px-3.5 py-2.5 mb-4 text-left"
          >
            <ClipboardCheck size={16} className="text-violet-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{t('checkin.dashboardCta')}</p>
              <p className="text-[11px] text-neutral-400">{t('checkin.dashboardHint')}</p>
            </div>
            <ChevronRight size={16} className="text-violet-300/70" />
          </button>
        )}
        {!calmHome && (
        <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4 mb-4 animate-fade-in-up">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">{t('dashboard.todaySummary')}</h2>
            <button
              onClick={() => navigate('/nutrition')}
              className="text-xs text-neutral-500 hover:text-neutral-300 flex items-center gap-0.5 transition-colors"
            >
              {t('common.details')}
              <ChevronRight size={12} />
            </button>
          </div>

          <div className="flex items-start gap-5">
            {/* Calorie ring — larger, central */}
            {showNutritionField(tracking, 'calories') && (
            <button onClick={() => navigate('/nutrition')} className="flex flex-col items-center gap-1 flex-shrink-0">
              <ProgressRing
                progress={caloriePct}
                size={80}
                strokeWidth={6}
                color={caloriePct >= 95 && caloriePct <= 105 ? '#10b981' : caloriePct > 105 ? '#f43f5e' : '#2563eb'}
              >
                <Flame size={20} className="text-orange-400" />
              </ProgressRing>
              <p className="text-sm font-bold text-white mt-1">{Math.round(consumed)}</p>
              <p className="text-[10px] text-neutral-500">/ {calorieTarget} kcal</p>
            </button>
            )}

            {/* Macros + Water */}
            <div className="flex-1 space-y-3 pt-1">
              {showNutritionField(tracking, 'protein') && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-neutral-300">{t('common.protein')}</span>
                  <span className="text-[11px] text-neutral-400">{Math.round(proteinConsumed)}g / {proteinTarget}g</span>
                </div>
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${proteinPct}%`, backgroundColor: '#38bdf8' }}
                  />
                </div>
              </div>
              )}

              {showNutritionField(tracking, 'carbs') && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-neutral-300">{t('common.carbs')}</span>
                  <span className="text-[11px] text-neutral-400">{Math.round(carbsConsumed)}g / {carbsTarget}g</span>
                </div>
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${carbsPct}%`, backgroundColor: '#fbbf24' }}
                  />
                </div>
              </div>
              )}

              {showNutritionField(tracking, 'fat') && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-neutral-300">{t('common.fat')}</span>
                  <span className="text-[11px] text-neutral-400">{Math.round(fatConsumed)}g / {fatTarget}g</span>
                </div>
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${fatPct}%`, backgroundColor: '#fb7185' }}
                  />
                </div>
              </div>
              )}

              {showNutritionField(tracking, 'water') && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-neutral-300 flex items-center gap-1">
                    <Droplets size={10} className="text-cyan-400" />
                    {t('coaching.water')}
                  </span>
                  <span className="text-[11px] text-neutral-400">{(waterConsumed / 1000).toFixed(1)}L / {(waterTarget / 1000).toFixed(1)}L</span>
                </div>
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${waterPct}%`, backgroundColor: '#22d3ee' }}
                  />
                </div>
              </div>
              )}
            </div>
          </div>
        </div>
        )}

        {showModule(tracking, 'workouts') && !calmHome && (
        <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4 mb-4 animate-fade-in-up stagger-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${weekGoalMet ? 'bg-emerald-500/20' : 'bg-blue-500/20'}`}>
                <Dumbbell size={15} className={weekGoalMet ? 'text-emerald-400' : 'text-blue-400'} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{t('dashboard.weeklyWorkouts')}</p>
                <p className="text-[11px] text-neutral-500">
                  {weekWorkoutsDone}/{trainingTarget} {t('dashboard.sessionsThisWeek')}
                </p>
              </div>
            </div>
            {weekGoalMet && (
              <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg">
                {t('dashboard.goalReached')}
              </span>
            )}
          </div>

          {/* Day dots */}
          <div className="flex justify-between gap-1">
            {DAY_KEYS.map((key, i) => {
              const label = t(`routines.form.days.${key}`);
              const isDone = doneDays[i];
              const isToday = i === todayIndex;
              const isFuture = i > todayIndex;
              return (
                <div key={i} className="flex flex-col items-center gap-1 flex-1">
                  <div className={`
                    w-full aspect-square max-w-[36px] rounded-lg flex items-center justify-center text-[11px] font-semibold transition-all
                    ${isDone
                      ? weekGoalMet
                        ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                        : 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                      : isToday
                      ? 'bg-neutral-800 text-white ring-1 ring-neutral-600'
                      : isFuture
                      ? 'bg-neutral-900/40 text-neutral-700'
                      : 'bg-neutral-800/60 text-neutral-600'
                    }
                  `}>
                    {isDone ? '✓' : label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, (weekWorkoutsDone / trainingTarget) * 100)}%`,
                background: weekGoalMet
                  ? 'linear-gradient(90deg, #10b981, #34d399)'
                  : 'linear-gradient(90deg, #2563eb, #3b82f6)',
              }}
            />
          </div>
        </div>
        )}

        {/* Streak & Weight row — hide on first-run so a weigh-in streak doesn't scold a new athlete */}
        {!calmHome && (
        <div className="grid grid-cols-2 gap-3 mb-4 animate-fade-in-up stagger-4">
          {/* Streak */}
          <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Flame size={16} className={currentStreak > 0 ? 'text-orange-400' : 'text-neutral-600'} />
              <span className="text-xs text-neutral-500">{t('dashboard.streak')}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold ${currentStreak >= 7 ? 'text-orange-300' : currentStreak > 0 ? 'text-orange-400' : 'text-neutral-500'}`}>
                {currentStreak}
              </span>
              <span className="text-xs text-neutral-500">{currentStreak !== 1 ? t('dashboard.days') : t('dashboard.day')}</span>
            </div>
            {longestStreak > 0 && (
              <p className="text-[10px] text-neutral-600 mt-1">
                {t('dashboard.bestStreak')}: {longestStreak}
              </p>
            )}
          </div>

          {/* Weight */}
          {showModule(tracking, 'weight') && (
          <button
            onClick={() => navigate('/weight')}
            className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4 text-left hover:border-neutral-700 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <Scale size={16} className="text-emerald-400" />
              <span className="text-xs text-neutral-500">{t('dashboard.weight')}</span>
            </div>
            {latestWeight !== null ? (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white">{latestWeight}</span>
                  <span className="text-xs text-neutral-500">{weightUnit}</span>
                </div>
                {weightDelta !== null && weightDelta !== 0 && (
                  <p className={`text-[10px] mt-1 font-medium ${weightDelta > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {weightDelta > 0 ? '+' : ''}{weightUnit === 'lbs' ? +(weightDelta * 2.20462).toFixed(1) : weightDelta} {weightUnit} {t('dashboard.thisWeek')}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-neutral-500 mt-1">{t('dashboard.noWeightYet')}</p>
            )}
          </button>
          )}
        </div>
        )}

        {/* Quick actions */}
        {!calmHome && (
        <div className="grid grid-cols-2 gap-3 animate-fade-in-up stagger-5">
          <button
            onClick={() => navigate('/stats')}
            className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4 text-left hover:border-neutral-700 active:scale-[0.98] transition-all"
          >
            <Footprints size={18} className="text-blue-400 mb-2" />
            <p className="text-sm font-medium text-white">{t('dashboard.viewStats')}</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">{t('dashboard.statsDesc')}</p>
          </button>
          <button
            onClick={() => navigate('/exercise-progress')}
            className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4 text-left hover:border-neutral-700 active:scale-[0.98] transition-all"
          >
            <TrendingUp size={18} className="text-emerald-400 mb-2" />
            <p className="text-sm font-medium text-white">{t('dashboard.viewProgress')}</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">{t('dashboard.progressDesc')}</p>
          </button>
        </div>
        )}
      </div>
    </PageTransition>
  );
}
