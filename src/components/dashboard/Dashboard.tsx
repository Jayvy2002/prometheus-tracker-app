import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Flame, Droplets, Dumbbell, ChevronRight, Play, Scale, AlertCircle, Battery, ClipboardCheck, MessageSquare, CalendarRange } from 'lucide-react';
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
import { useDashboardBootstrap } from '../../features/dashboard/hooks/useDashboardBootstrap';
import { startWorkoutFromTemplate } from '../../lib/startWorkout';
import { toWorkoutTemplateExercise } from '../../lib/programSetPrescription';
import { todayStr, toLocalDateStr, kgToLbs, programWeekNumber, formatWeekdayDate } from '../../lib/utils';
import { useClientTracking } from '../../lib/useClientTracking';
import { anyMacroField, showModule, showNutritionField } from '../../lib/clientTracking';
import { isCoachedAthlete } from '../../lib/coachRole';
import { nutritionTargetsFromProfile, targetRatio } from '../../lib/nutritionTargets';
import {
  clientHomeAttention,
  clientHomeNextAction,
  clientHomeNextActionKey,
  daysSinceActivity,
  isClientFirstRun,
  pickTodayReminder,
  shouldShowDaysSinceReminder,
} from '../../lib/clientHome';
import { isProgramDayDue, resolveClientGymCard } from '../../lib/clientGym';
import { resolveTrainingFrequency } from '../../lib/trainingFrequency';
import { dismissHomeMessage, isHomeMessageDismissed } from '../../lib/messageDrafts';
import type { ProgramDay } from '../../lib/types';
import PageTransition from '../ui/PageTransition';
import Button from '../ui/Button';
import Card from '../ui/Card';
import CardLink from '../ui/CardLink';
import ListRow from '../ui/ListRow';
import NutritionRings from '../nutrition/NutritionRings';
import ClientGymCard from './ClientGymCard';
import DashboardWeightCard from './DashboardWeightCard';
import SoloWeeklyReview from './SoloWeeklyReview';
import SoloProgramProposal from './SoloProgramProposal';
import LinkEndedBanner from './LinkEndedBanner';

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
  const { logs, waterLogs } = useNutritionStore();
  const { measurements } = useWeightStore();
  const { workouts, loading: workoutsLoading } = useWorkoutStore();
  const { streak } = useStreakStore();
  const { routines, fetchRoutineWithExercises } = useRoutineStore();
  const { todayCheckin, checkins, loading: checkinLoading } = useCheckinStore();
  const { myCoach, coachingRole, latestCoachMessage, unreadMessageCount } = useCoachingStore();
  const { assignment } = useProgramStore();
  const tracking = useClientTracking();
  const { nutritionHistoryCount, assignmentReady } = useDashboardBootstrap();
  const [startingRoutine, setStartingRoutine] = useState(false);
  const [dismissedReminders, setDismissedReminders] = useState<string[]>([]);
  const [homeDismissTick, setHomeDismissTick] = useState(0);

  const dismissReminder = (key: string) => {
    setDismissedReminders(prev => [...prev, key]);
  };

  const firstName = profile?.full_name?.split(' ')[0] || '';
  const hour = new Date().getHours();
  const timeKey = hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening';
  const greeting = `${t(`dashboard.${timeKey}`)}${firstName ? `, ${firstName}` : ''} !`;

  // Daily metrics — never invent a target the user or coach did not set.
  const nutritionTargets = nutritionTargetsFromProfile(profile);
  const calorieTarget = nutritionTargets.calories ?? 0;
  const consumed = logs.reduce((sum, l) => sum + l.calories, 0);

  const waterTarget = nutritionTargets.waterMl;
  const waterConsumed = waterLogs.reduce((sum, l) => sum + l.amount_ml, 0);
  const waterPct = targetRatio(waterConsumed, waterTarget);

  // Weekly workout goal
  const weekDates = getWeekDates();
  const todayIndex = weekDates.indexOf(todayStr());
  const trainingTarget = resolveTrainingFrequency(
    profile?.training_frequency,
    assignment?.status === 'active' ? assignment.program?.days : null,
  );
  const doneDays = weekDates.map(date =>
    workouts.some(w => w.completed && w.date?.startsWith(date))
  );
  const weekWorkoutsDone = doneDays.filter(Boolean).length;
  const weekGoalMet = weekWorkoutsDone >= trainingTarget;

  // Streak
  const currentStreak = streak?.current_streak ?? 0;
  const longestStreak = streak?.longest_streak ?? 0;

  // Weight trend (last 14)
  const recentWeights = [...measurements]
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
    .slice(-14);
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
  const hasCoach = isCoachedAthlete(coachingRole, myCoach);
  const scheduledToday = !alreadyTrainedToday
    ? routines.find(r => r.scheduled_days?.includes(todayDow))
    : null;
  // Personal routines are the solo's templates; a coached athlete waits for his coach's program.
  const nextRoutine = !hasCoach && !hasProgram && gymCard.kind === 'none'
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
  const nextAction = clientHomeNextAction({
    firstRun,
    hasProgram,
    hasNextWorkout,
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
  // Meal / water nudges and the deload tip are self-coaching: a coached athlete's coach decides.
  const showMealReminder = !hasCoach && !calmHome && (
    (hourNow >= 13 && hourNow <= 16 && !hasLoggedLunch && consumed === 0) ||
    (hourNow >= 13 && !hasLoggedLunch && consumed < calorieTarget * 0.3)
  );

  const showWaterReminder = !hasCoach && !calmHome && hourNow >= 15 && waterConsumed > 0 && waterTarget != null && waterPct < 50;

  // Deload suggestion — if trained 4+ consecutive weeks without a break
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const recentCompletedWorkouts = workouts.filter(w => w.completed && new Date(w.date) >= fourWeeksAgo);
  const weeksWithWorkouts = new Set(recentCompletedWorkouts.map(w => {
    const d = new Date(w.date);
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    return Math.floor((d.getTime() - startOfYear.getTime()) / (7 * 86400000));
  }));
  const showDeloadSuggestion = !hasCoach && weeksWithWorkouts.size >= 4 && recentCompletedWorkouts.length >= 12;
  const showGymHero = hasGymCard && !!assignment?.program;
  const dueGymHero = showGymHero && isProgramDayDue(gymCard);
  const restGymCard = showGymHero && !dueGymHero;
  const showRoutineHero = !showGymHero && !!nextRoutine && showModule(tracking, 'workouts');
  const showNextActionHero = !activityPending && !showGymHero && !showRoutineHero && nextAction !== null;
  const hasPrimaryHero = dueGymHero || showRoutineHero || showNextActionHero;
  const checkinDue = !firstRun && showModule(tracking, 'checkins') && !todayCheckin && !activityPending;
  const unreadMessage = !!myCoach && unreadMessageCount > 0
    && homeDismissTick >= 0
    && !isHomeMessageDismissed(user?.id, latestCoachMessage?.id);
  const todayReminder = pickTodayReminder({
    deload: showDeloadSuggestion,
    meal: showNutritionField(tracking, 'calories') && showMealReminder,
    water: showNutritionField(tracking, 'water') && showWaterReminder,
    weight: showModule(tracking, 'weight') && showWeightReminder,
  }, dismissedReminders);
  const attention = clientHomeAttention({
    unreadMessage,
    checkinDue,
    reminder: todayReminder,
  });
  const hasAttention = attention.unreadMessage || attention.checkinDue || attention.reminder !== null;

  const showRestGym = restGymCard;
  const showEmptyToday = !activityPending && !hasPrimaryHero && !showRestGym && !hasAttention;
  const weightPoints = recentWeights.map(m => ({
    date: m.measured_at.slice(5, 10),
    weight: +(weightUnit === 'lbs' ? kgToLbs(m.weight_kg) : Number(m.weight_kg)).toFixed(1),
  }));
  const weightDeltaDisplay = weightDelta === null
    ? null
    : +(weightUnit === 'lbs' ? weightDelta * 2.20462 : weightDelta).toFixed(1);
  const showNutritionRings = anyMacroField(tracking) && !activityPending;

  const startProgramDay = async (day: ProgramDay) => {
    if (!user || startingRoutine || !assignment?.program) return;
    setStartingRoutine(true);
    try {
      const workoutId = await startWorkoutFromTemplate({
        userId: user.id,
        name: day.name || assignment.program.name,
        programAssignmentId: assignment.id,
        programDayId: day.id,
        exercises: (day.exercises ?? []).map((ex, i) => toWorkoutTemplateExercise(ex, i)),
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
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-neutral-800">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-blue-600/20 flex items-center justify-center text-blue-400 text-sm font-bold">
                {firstName[0]?.toUpperCase() || 'U'}
              </div>
            )}
          </div>
          <div className="flex-1">
            <p className="text-neutral-400 text-xs">
              {t('nav.today')} · {formatWeekdayDate(new Date(), i18n.language)}
            </p>
            <p className="text-sm font-medium text-white leading-snug">{greeting}</p>
            {myCoach && (
              <p className="text-[11px] text-blue-400/80 mt-0.5">
                {t('coaching.coachedBy', { name: myCoach.full_name || t('coaching.invite.aCoach') })}
              </p>
            )}
          </div>
        </div>

        <LinkEndedBanner />

        <div data-testid="dashboard-priority">
        {dueGymHero && assignment?.program && (
          <ClientGymCard
            card={gymCard}
            programName={assignment.program.name}
            programWeek={programWeek}
            durationWeeks={assignment.program.duration_weeks}
            starting={startingRoutine}
            onStart={startProgramDay}
            onContinue={workoutId => navigate(`/workout/${workoutId}`)}
            onEditPlan={!hasCoach ? () => navigate('/programs') : undefined}
          />
        )}

        {showRoutineHero && nextRoutine && (
          <div className="w-full bg-gradient-to-r from-blue-600/20 to-blue-500/5 border border-blue-500/30 rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                <Play size={18} className="text-blue-400 ml-0.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-blue-300 font-medium">{t('dashboard.nextWorkout')}</p>
                <p className="text-sm font-semibold text-white truncate">{nextRoutine.name}</p>
                {nextRoutine.exercises && (
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {nextRoutine.exercises.length} {t('dashboard.exercises')}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3">
              <Button
                type="button"
                size="sm"
                loading={startingRoutine}
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
              >
                {t('dashboard.gym.startCta')}
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}

        {showNextActionHero && nextAction === 'first_session' && showModule(tracking, 'workouts') ? (
          <ListRow
            className="mb-4"
            title={t('dashboard.firstRun.firstSession')}
            to="/workout"
          />
        ) : showNextActionHero && nextAction === 'waiting_program' ? (
          <ListRow
            className="mb-4"
            title={t(clientHomeNextActionKey(nextAction))}
            to="/messages"
          />
        ) : showEmptyToday ? (
          <ListRow className="mb-4" title={t('dashboard.nothingToday')} />
        ) : null}
        </div>

        {hasAttention && (
          <p className="text-[10px] font-semibold text-neutral-600 uppercase tracking-widest mb-2">
            {t('dashboard.attentionTitle')}
          </p>
        )}
        {attention.unreadMessage && (
          <ListRow
            className="mb-4"
            tone="info"
            icon={<MessageSquare size={16} />}
            title={t('dashboard.coachMessageTitle')}
            badge={unreadMessageCount > 1 ? unreadMessageCount : undefined}
            subtitle={latestCoachMessage?.body || t('coaching.messages.openInbox')}
            to="/messages"
            onDismiss={() => {
              dismissHomeMessage(user?.id, latestCoachMessage?.id);
              setHomeDismissTick(n => n + 1);
            }}
            dismissLabel={t('common.dismiss')}
          />
        )}

        {attention.checkinDue && (
          <ListRow
            className="mb-4"
            tone="info"
            icon={<ClipboardCheck size={16} />}
            title={t('checkin.dashboardCta')}
            subtitle={!hasCoach ? t('checkin.dashboardHintSolo') : undefined}
            to="/checkin"
          />
        )}

        {attention.reminder === 'deload' && (
          <ListRow
            className="mb-4"
            tone="warning"
            icon={<Battery size={16} />}
            title={t('dashboard.reminders.deload')}
            onClick={() => navigate('/workout')}
            onDismiss={() => dismissReminder('deload')}
            dismissLabel={t('common.dismiss')}
          />
        )}
        {attention.reminder === 'meal' && (
          <ListRow
            className="mb-4"
            tone="warning"
            icon={<AlertCircle size={16} />}
            title={t('dashboard.reminders.meal')}
            onClick={() => navigate('/nutrition')}
            onDismiss={() => dismissReminder('meal')}
            dismissLabel={t('common.dismiss')}
          />
        )}
        {attention.reminder === 'water' && (
          <ListRow
            className="mb-4"
            tone="info"
            icon={<Droplets size={16} />}
            title={t('dashboard.reminders.water')}
            onClick={() => navigate('/nutrition')}
            onDismiss={() => dismissReminder('water')}
            dismissLabel={t('common.dismiss')}
          />
        )}
        {attention.reminder === 'weight' && (
          <ListRow
            className="mb-4"
            tone="info"
            icon={<Scale size={16} />}
            title={t('dashboard.reminders.weight', { days: daysSinceWeighIn ?? 0 })}
            onClick={() => navigate('/weight')}
            onDismiss={() => dismissReminder('weight')}
            dismissLabel={t('common.dismiss')}
          />
        )}

        <SoloProgramProposal variant="notice" />

        {!activityPending && (
          <p className="text-[10px] font-semibold text-neutral-600 uppercase tracking-widest mb-2 mt-1">
            {t('dashboard.overviewTitle')}
          </p>
        )}
        <div data-testid="dashboard-overview">
        {showRestGym && assignment?.program && (
          <ClientGymCard
            card={gymCard}
            programName={assignment.program.name}
            programWeek={programWeek}
            durationWeeks={assignment.program.duration_weeks}
            starting={startingRoutine}
            onStart={startProgramDay}
            onContinue={workoutId => navigate(`/workout/${workoutId}`)}
            onEditPlan={!hasCoach ? () => navigate('/programs') : undefined}
          />
        )}

        {!hasCoach && !activityPending && !firstRun && <SoloWeeklyReview />}
        {showModule(tracking, 'workouts') && !activityPending && (
          <CardLink to="/programs" className="mb-4" data-testid="dashboard-program">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <CalendarRange size={16} className="text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{t('nav.myProgram')}</p>
                  <p className="text-[11px] text-neutral-500 truncate">
                    {assignment?.program?.name
                      ?? (hasCoach ? t('dashboard.firstRun.waitingProgram') : t('dashboard.programHint'))}
                  </p>
                </div>
              </div>
              <ChevronRight size={16} className="text-neutral-600 shrink-0" />
            </div>
          </CardLink>
        )}
        {showNutritionRings && (
          <CardLink to="/nutrition" className="mb-4">
            <NutritionRings />
          </CardLink>
        )}

        {showModule(tracking, 'weight') && !activityPending && (
          <DashboardWeightCard
            points={weightPoints}
            unit={weightUnit}
            latest={latestWeight}
            delta={weightDeltaDisplay}
          />
        )}

        {showModule(tracking, 'workouts') && !activityPending && (
        <Card className="mb-4">
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
        </Card>
        )}

        {!activityPending && (hasCoach || (showModule(tracking, 'checkins') && todayCheckin) || (showModule(tracking, 'workouts') && !firstRun)) && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {showModule(tracking, 'checkins') && todayCheckin && (
            <CardLink to="/checkin">
              <div className="flex items-center gap-2 mb-1">
                <ClipboardCheck size={16} className="text-blue-400" />
                <span className="text-xs text-neutral-500">{t('nav.checkin')}</span>
              </div>
              <p className="text-sm font-semibold text-white">{t('dashboard.checkinDone')}</p>
            </CardLink>
          )}
          {hasCoach && (
            <CardLink to="/messages">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare size={16} className="text-blue-400" />
                <span className="text-xs text-neutral-500">{t('nav.messages')}</span>
              </div>
              <p className="text-sm font-semibold text-white truncate">
                {t('dashboard.coachingFollow', { name: myCoach?.full_name || t('coaching.invite.aCoach') })}
              </p>
            </CardLink>
          )}
          {showModule(tracking, 'workouts') && !firstRun && (
            <CardLink to="/exercise-progress">
              <div className="flex items-center gap-2 mb-1">
                <Dumbbell size={16} className="text-blue-400" />
                <span className="text-xs text-neutral-500">{t('dashboard.viewProgress')}</span>
              </div>
              <p className="text-sm text-neutral-400">{t('dashboard.progressDesc')}</p>
            </CardLink>
          )}
        </div>
        )}

        {!hasCoach && !activityPending && (
        <Card className="mb-4">
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
            <p className="text-xs text-neutral-600 mt-1">
              {t('dashboard.bestStreak')}: {longestStreak}
            </p>
          )}
        </Card>
        )}
        </div>
      </div>
    </PageTransition>
  );
}
