import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Droplets, Dumbbell, ChevronRight, Play, Scale, AlertCircle, ClipboardCheck, MessageSquare, CalendarRange } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import { useWeightStore } from '../../stores/weightStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useRoutineStore } from '../../stores/routineStore';
import { useCheckinStore } from '../../stores/checkinStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { useProgramStore } from '../../stores/programStore';
import { useDashboardBootstrap } from '../../features/dashboard/hooks/useDashboardBootstrap';
import { startWorkoutFromTemplate } from '../../lib/startWorkout';
import { toWorkoutTemplateExercise } from '../../lib/programSetPrescription';
import { toLocalDateStr, kgToLbs, programWeekNumber, formatWeekdayDate } from '../../lib/utils';
import { rollingWeightTrend, weeklyAverageKg } from '../../lib/weeklyWeight';
import { useClientTracking } from '../../lib/useClientTracking';
import { anyMacroField, showModule, showNutritionField } from '../../lib/clientTracking';
import { isCoachedAthlete } from '../../lib/coachRole';
import { useResourcePermissions } from '../../lib/useResourcePermissions';
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
import { isProgramDayDue, resolveAssignmentGymCard } from '../../lib/clientGym';
import { assignStartLabel } from '../../lib/programWrite';
import { resolveTrainingFrequency } from '../../lib/trainingFrequency';
import { useProgramCivilClock } from '../../features/programs/hooks/useProgramCivilClock';
import { effectiveVersionStart } from '../../features/programs/domain/programPhases';
import { dismissHomeMessage, isHomeMessageDismissed } from '../../lib/messageDrafts';
import type { ProgramDay } from '../../lib/types';
import PageTransition from '../ui/PageTransition';
import Button from '../ui/Button';
import CardLink from '../ui/CardLink';
import ListRow from '../ui/ListRow';
import NutritionRings from '../nutrition/NutritionRings';
import ClientGymCard from './ClientGymCard';
import DashboardWeightCard from './DashboardWeightCard';
import SoloProgramProposal from './SoloProgramProposal';
import SoloWeeklyReview from './SoloWeeklyReview';
import LinkEndedBanner from './LinkEndedBanner';
import WatchSummaryRow from './WatchSummaryRow';

function getWeekDates(todayCivil: string): string[] {
  const [y, m, d] = todayCivil.split('-').map(Number);
  const monday = new Date(y, m - 1, d);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return toLocalDateStr(day);
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
  const { routines, fetchRoutineWithExercises } = useRoutineStore();
  const { todayCheckin, checkins, loading: checkinLoading } = useCheckinStore();
  const { myCoach, coachingRole, latestCoachMessage, unreadMessageCount } = useCoachingStore();
  const { canUpdateOwnAssignedProgram: canEditOwnPlan } = useResourcePermissions();
  const { assignment } = useProgramStore();
  const programClock = useProgramCivilClock();
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
  const weekDates = getWeekDates(programClock.today);
  const todayIndex = weekDates.indexOf(programClock.today);
  const trainingTarget = resolveTrainingFrequency(
    profile?.training_frequency,
    assignment?.status === 'active' ? assignment.program?.days : null,
  );
  const doneDays = weekDates.map(date =>
    workouts.some(w => w.completed && w.date?.startsWith(date))
  );
  const weekWorkoutsDone = doneDays.filter(Boolean).length;
  const weekGoalMet = weekWorkoutsDone >= trainingTarget;

  const weightUnit = profile?.unit_weight ?? 'kg';
  const weekWeight = weeklyAverageKg(measurements, programClock.today);
  const latestWeight = weekWeight.current == null
    ? null
    : +(weightUnit === 'lbs' ? kgToLbs(weekWeight.current) : weekWeight.current).toFixed(1);
  const weightDelta = weekWeight.deltaKg;

  const todayDow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][programClock.weekday];
  const alreadyTrainedToday = doneDays[todayIndex];
  const hasProgram = !!assignment?.program && assignment.status === 'active';
  const gymCard = resolveAssignmentGymCard({
    assignment: hasProgram ? assignment : null,
    workouts,
    todayWeekday: programClock.weekday,
    todayDate: programClock.today,
  });
  const versionStart = assignment?.program
    ? effectiveVersionStart(assignment.start_date, assignment.program.phase_anchor_on)
    : null;
  const programWeek = assignment?.program
    ? programWeekNumber(versionStart ?? assignment.start_date, assignment.program.duration_weeks, programClock.today)
    : null;
  const gymPhaseName = gymCard.phase?.name ?? null;
  const gymPlannedChange = assignment?.program?.scheduled_activates_on
    ? t('programs.plannedChangeOn', {
      date: assignStartLabel(assignment.program.scheduled_activates_on, i18n.language),
    })
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
  // Meal / water nudges are self-coaching: a coached athlete's coach decides.
  const showMealReminder = !hasCoach && !calmHome && (
    (hourNow >= 13 && hourNow <= 16 && !hasLoggedLunch && consumed === 0) ||
    (hourNow >= 13 && !hasLoggedLunch && consumed < calorieTarget * 0.3)
  );

  const showWaterReminder = !hasCoach && !calmHome && hourNow >= 15 && waterConsumed > 0 && waterTarget != null && waterPct < 50;

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
    // Deload is a plan decision (phases, signals), not a home nudge.
    deload: false,
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
  // The sparkline draws the 7-day trend, not the daily noise.
  const weightPoints = rollingWeightTrend(measurements).slice(-14).map(m => ({
    date: m.day.slice(5, 10),
    weight: +(weightUnit === 'lbs' ? kgToLbs(m.trend_kg) : m.trend_kg).toFixed(1),
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
            onEditPlan={canEditOwnPlan ? () => navigate('/programs') : undefined}
            phaseName={gymPhaseName}
            plannedChange={gymPlannedChange}
            onOpenProgram={() => navigate('/programs')}
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
          <div className="mb-4">
            <Button className="w-full" onClick={() => navigate('/workout/new')}>
              {t('dashboard.firstRun.startSession')}
            </Button>
          </div>
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

        {!activityPending && !firstRun && <WatchSummaryRow athleteId={user?.id} />}

        {/* One AI card, only when a decision waits. The weekly review also
            persists the solo's weekly cycle (signals, review) on mount. */}
        {!hasCoach && !activityPending && !firstRun && <SoloWeeklyReview />}
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
            onEditPlan={canEditOwnPlan ? () => navigate('/programs') : undefined}
            phaseName={gymPhaseName}
            plannedChange={gymPlannedChange}
            onOpenProgram={() => navigate('/programs')}
          />
        )}

        {showModule(tracking, 'workouts') && !activityPending && !hasGymCard && (
          <ListRow
            className="mb-4"
            data-testid="dashboard-program"
            icon={<CalendarRange size={16} />}
            title={t('nav.myProgram')}
            subtitle={assignment?.program?.name
              ?? (hasCoach ? t('dashboard.firstRun.waitingProgram') : t('dashboard.programHint'))}
            to="/programs"
          />
        )}
        {/* Adding a meal or a weigh-in goes through the quick-add button. */}
        {showNutritionRings && (
          <CardLink to="/nutrition" className="mb-4">
            <NutritionRings />
          </CardLink>
        )}

        {!activityPending && (showModule(tracking, 'weight') || showModule(tracking, 'workouts')) && (
          <div className={`grid gap-3 mb-4 ${showModule(tracking, 'weight') && showModule(tracking, 'workouts') ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {showModule(tracking, 'weight') && (
              <DashboardWeightCard
                points={weightPoints}
                unit={weightUnit}
                latest={latestWeight}
                delta={weightDeltaDisplay}
              />
            )}
            {showModule(tracking, 'workouts') && (
              <CardLink to="/calendar" className="h-full" data-testid="dashboard-week">
                <div className="flex items-center gap-2 mb-2">
                  <Dumbbell size={14} className={weekGoalMet ? 'text-emerald-400' : 'text-blue-400'} aria-hidden="true" />
                  <p className="text-xs text-neutral-400">{t('dashboard.weeklyWorkouts')}</p>
                </div>
                <p className="text-lg font-semibold text-white leading-tight">
                  {weekWorkoutsDone}/{trainingTarget}
                  <span className="text-xs font-normal text-neutral-500"> {t('dashboard.sessionsThisWeek')}</span>
                </p>
                {weekGoalMet && <p className="text-[11px] text-emerald-400">{t('dashboard.goalReached')}</p>}
                {/* Day dots: done, today, rest of the week. */}
                <div className="mt-3 flex justify-between gap-1" aria-hidden="true">
                  {DAY_KEYS.map((key, i) => {
                    const isDone = doneDays[i];
                    const isToday = i === todayIndex;
                    return (
                      <div key={key} className="flex flex-col items-center gap-1 flex-1">
                        <span className={`h-2 w-2 rounded-full ${isDone
                          ? weekGoalMet ? 'bg-emerald-400' : 'bg-blue-400'
                          : isToday ? 'bg-neutral-300' : 'bg-neutral-700'}`} />
                        <span className={`text-[9px] ${isToday ? 'text-white' : 'text-neutral-600'}`}>
                          {t(`routines.form.days.${key}`)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardLink>
            )}
          </div>
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
        </div>
        )}
        </div>
      </div>
    </PageTransition>
  );
}
