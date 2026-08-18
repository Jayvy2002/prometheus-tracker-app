import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Flame, Droplets, Dumbbell, TrendingUp, Footprints, ChevronRight, Play, Scale, AlertCircle, Battery } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import { useWeightStore } from '../../stores/weightStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useStreakStore } from '../../stores/streakStore';
import { useRoutineStore } from '../../stores/routineStore';
import { todayStr } from '../../lib/utils';
import ProgressRing from '../ui/ProgressRing';
import PageTransition from '../ui/PageTransition';

function getWeekDates(): string[] {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const { logs, waterLogs, fetchLogs, fetchWaterLogs } = useNutritionStore();
  const { measurements, fetchMeasurements } = useWeightStore();
  const { workouts, fetchWorkouts, createWorkout, addExercise, addSet, deleteWorkout } = useWorkoutStore();
  const { streak, fetchStreak } = useStreakStore();
  const { routines, fetchRoutines, fetchRoutineWithExercises } = useRoutineStore();
  const [startingRoutine, setStartingRoutine] = useState(false);

  useEffect(() => {
    if (!user) return;
    const today = todayStr();
    fetchLogs(user.id, today);
    fetchWaterLogs(user.id, today);
    fetchMeasurements(user.id);
    fetchWorkouts(user.id);
    fetchStreak(user.id);
    fetchRoutines(user.id);
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
      ? +(recentWeights[recentWeights.length - 1].weight_kg * 2.20462).toFixed(1)
      : +recentWeights[recentWeights.length - 1].weight_kg
    : null;
  const weightDelta = recentWeights.length >= 2
    ? +(recentWeights[recentWeights.length - 1].weight_kg - recentWeights[0].weight_kg).toFixed(1)
    : null;

  // Next routine to suggest — prefer one scheduled for today
  const todayDow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
  const alreadyTrainedToday = doneDays[todayIndex];
  const scheduledToday = !alreadyTrainedToday
    ? routines.find(r => r.scheduled_days?.includes(todayDow))
    : null;
  const nextRoutine = scheduledToday || (!alreadyTrainedToday && routines.length > 0 ? routines[0] : null);

  // Reminders
  const lastWeighIn = measurements.length > 0
    ? measurements.sort((a, b) => b.measured_at.localeCompare(a.measured_at))[0]
    : null;
  const daysSinceWeighIn = lastWeighIn
    ? Math.floor((Date.now() - new Date(lastWeighIn.measured_at).getTime()) / 86400000)
    : 999;
  const showWeightReminder = daysSinceWeighIn >= 3;

  const hourNow = new Date().getHours();
  const hasLoggedLunch = logs.some(l => l.category === 'lunch');
  const showMealReminder = hourNow >= 13 && hourNow <= 16 && !hasLoggedLunch && consumed === 0 || (hourNow >= 13 && !hasLoggedLunch && consumed < calorieTarget * 0.3);

  const showWaterReminder = hourNow >= 15 && waterPct < 50;

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
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <p className="text-sm font-medium text-white leading-snug">{greeting}</p>
          </div>
        </div>

        {/* Daily Progress Section */}
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

            {/* Macros + Water */}
            <div className="flex-1 space-y-3 pt-1">
              {/* Protein */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-neutral-300">{t('common.protein')}</span>
                  <span className="text-[11px] text-neutral-400">{Math.round(proteinConsumed)}g / {proteinTarget}g</span>
                </div>
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${proteinPct}%`, backgroundColor: '#f59e0b' }}
                  />
                </div>
              </div>

              {/* Carbs */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-neutral-300">{t('common.carbs')}</span>
                  <span className="text-[11px] text-neutral-400">{Math.round(carbsConsumed)}g / {carbsTarget}g</span>
                </div>
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${carbsPct}%`, backgroundColor: '#3b82f6' }}
                  />
                </div>
              </div>

              {/* Fat */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-neutral-300">{t('common.fat')}</span>
                  <span className="text-[11px] text-neutral-400">{Math.round(fatConsumed)}g / {fatTarget}g</span>
                </div>
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${fatPct}%`, backgroundColor: '#ec4899' }}
                  />
                </div>
              </div>

              {/* Water */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-neutral-300 flex items-center gap-1">
                    <Droplets size={10} className="text-cyan-400" />
                    Eau
                  </span>
                  <span className="text-[11px] text-neutral-400">{(waterConsumed / 1000).toFixed(1)}L / {(waterTarget / 1000).toFixed(1)}L</span>
                </div>
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${waterPct}%`, backgroundColor: '#06b6d4' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Weekly Workout Goal */}
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
            {DAY_LABELS.map((label, i) => {
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

        {/* Next Workout (clickable) */}
        {nextRoutine && (
          <button
            disabled={startingRoutine}
            onClick={async () => {
              if (!user || startingRoutine) return;
              setStartingRoutine(true);
              let workoutId: string | null = null;
              try {
                const routine = await fetchRoutineWithExercises(nextRoutine.id);
                if (!routine) return;
                const exercises = (routine as unknown as { routine_exercises?: import('../../lib/types').RoutineExercise[] }).routine_exercises ?? routine.exercises ?? [];
                const now = new Date();
                workoutId = await createWorkout({
                  user_id: user.id,
                  name: routine.name,
                  date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T12:00:00`,
                  routine_id: nextRoutine.id,
                });
                if (!workoutId) return;
                for (const ex of exercises) {
                  const addedEx = await addExercise(workoutId, ex.name, ex.order_index);
                  if (addedEx) {
                    for (let i = 0; i < ex.default_sets; i++) {
                      await addSet(addedEx.id, i);
                    }
                  }
                }
                navigate(`/workout/${workoutId}`);
              } catch {
                if (workoutId) await deleteWorkout(workoutId);
              } finally {
                setStartingRoutine(false);
              }
            }}
            className="w-full bg-gradient-to-r from-blue-600/15 to-blue-500/5 border border-blue-500/20 rounded-2xl p-4 mb-4 animate-fade-in-up stagger-3 text-left hover:border-blue-500/40 active:scale-[0.98] transition-all"
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
              <ChevronRight size={18} className="text-blue-400/60 shrink-0" />
            </div>
          </button>
        )}

        {/* Streak & Weight row */}
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
        </div>

        {/* Reminders */}
        {(showWeightReminder || showMealReminder || showWaterReminder || showDeloadSuggestion) && (
          <div className="space-y-2 mb-4 animate-fade-in-up stagger-5">
            {showDeloadSuggestion && (
              <button
                onClick={() => navigate('/workout')}
                className="w-full flex items-center gap-3 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 text-left hover:border-amber-500/40 transition-colors"
              >
                <Battery size={16} className="text-amber-400 shrink-0" />
                <p className="text-xs text-amber-200/80 flex-1">{t('dashboard.reminders.deload')}</p>
              </button>
            )}
            {showWeightReminder && (
              <button
                onClick={() => navigate('/weight')}
                className="w-full flex items-center gap-3 bg-neutral-900/60 border border-neutral-800/50 rounded-xl px-4 py-3 text-left hover:border-neutral-700 transition-colors"
              >
                <AlertCircle size={14} className="text-neutral-500 shrink-0" />
                <p className="text-xs text-neutral-400 flex-1">{t('dashboard.reminders.weight', { days: daysSinceWeighIn })}</p>
              </button>
            )}
            {showMealReminder && (
              <button
                onClick={() => navigate('/nutrition')}
                className="w-full flex items-center gap-3 bg-neutral-900/60 border border-neutral-800/50 rounded-xl px-4 py-3 text-left hover:border-neutral-700 transition-colors"
              >
                <AlertCircle size={14} className="text-neutral-500 shrink-0" />
                <p className="text-xs text-neutral-400 flex-1">{t('dashboard.reminders.meal')}</p>
              </button>
            )}
            {showWaterReminder && (
              <button
                onClick={() => navigate('/nutrition')}
                className="w-full flex items-center gap-3 bg-neutral-900/60 border border-neutral-800/50 rounded-xl px-4 py-3 text-left hover:border-neutral-700 transition-colors"
              >
                <AlertCircle size={14} className="text-neutral-500 shrink-0" />
                <p className="text-xs text-neutral-400 flex-1">{t('dashboard.reminders.water')}</p>
              </button>
            )}
          </div>
        )}

        {/* Quick actions */}
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
      </div>
    </PageTransition>
  );
}
