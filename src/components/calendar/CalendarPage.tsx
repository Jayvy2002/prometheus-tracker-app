import { useEffect, useState, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Dumbbell, Apple, Scale, CalendarDays, CalendarRange, Ruler } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useClientTracking } from '../../lib/useClientTracking';
import { checkinHasAnyField, showModule } from '../../lib/clientTracking';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useWeightStore } from '../../stores/weightStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import { supabase } from '../../lib/supabase';
import { parseDateStr, parseDate, formatWeight, toLocalDateStr, dateLocale } from '../../lib/utils';
import { correctNutritionLogEnergy } from '../../lib/foodEnergy';
import { useProfileStore } from '../../stores/profileStore';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { calendarDayWeights, calendarDayWorkouts, responsesHaveError } from '../../lib/progressSearch';
import { planMarkForDate, type PlanCalendarMark } from '../../features/programs/domain/planCalendar';
import { programGraphForDate } from '../../features/programs/domain/programVersions';
import { parseRevisionMeta, parseRevisionOrganization, parseRevisionSnapshot, snapshotToPhaseDrafts } from '../../features/programs/domain/programRevisionDiff';
import { useProgramStore } from '../../stores/programStore';
import { phaseAnchorDate } from '../../features/programs/domain/programPhases';
import { useProgramCivilClock } from '../../features/programs/hooks/useProgramCivilClock';

interface DayData {
  date: string;
  hasWorkout: boolean;
  hasNutrition: boolean;
  hasWeight: boolean;
  inCurrentPeriod?: boolean;
}

interface DaySummary {
  workouts: { id: string; name: string; exerciseCount: number }[];
  nutrition: { totalCals: number; protein: number; carbs: number; fat: number } | null;
  nutritionCount: number;
  weights: number[];
  measurementCount: number;
  checkinNote: string | null;
}

type ViewMode = 'week' | 'month';

function getWeekDates(baseDate: Date): Date[] {
  const monday = new Date(baseDate);
  const day = monday.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  monday.setDate(monday.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getMonthDates(year: number, month: number): { date: Date; inMonth: boolean }[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const startDay = new Date(firstDay);
  const dow = startDay.getDay();
  startDay.setDate(startDay.getDate() - (dow === 0 ? 6 : dow - 1));

  const endDay = new Date(lastDay);
  const edow = endDay.getDay();
  if (edow !== 0) endDay.setDate(endDay.getDate() + (7 - edow));

  const dates: { date: Date; inMonth: boolean }[] = [];
  const current = new Date(startDay);
  while (current <= endDay) {
    dates.push({ date: new Date(current), inMonth: current.getMonth() === month });
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function dateToStr(d: Date): string {
  return toLocalDateStr(d);
}

export default function CalendarPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const tracking = useClientTracking();
  const { workouts, workoutsExhausted, fetchWorkouts, fetchOlderWorkouts, createWorkout } = useWorkoutStore();
  const { measurements, fetchMeasurements } = useWeightStore();
  const { setSelectedDate: setNutritionDate } = useNutritionStore();
  const assignment = useProgramStore(s => s.assignment);
  const fetchMyAssignment = useProgramStore(s => s.fetchMyAssignment);
  const programClock = useProgramCivilClock();
  const today = programClock.today;

  const DAY_LABELS = [
    t('calendar.days.mon'),
    t('calendar.days.tue'),
    t('calendar.days.wed'),
    t('calendar.days.thu'),
    t('calendar.days.fri'),
    t('calendar.days.sat'),
    t('calendar.days.sun'),
  ];

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(today);
  const [allNutritionDates, setAllNutritionDates] = useState<Set<string>>(new Set());
  const [daySummary, setDaySummary] = useState<DaySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  const [summaryRetry, setSummaryRetry] = useState(0);
  const summarySeq = useRef(0);
  const unit = profile?.unit_weight ?? 'kg';

  useEffect(() => {
    if (!user) return;
    fetchWorkouts(user.id);
    fetchMeasurements(user.id);
    void fetchMyAssignment(user.id);
  }, [user]);

  // Q05 : en naviguant vers le passé, charge les pages plus anciennes.
  useEffect(() => {
    if (!user || workoutsExhausted || workouts.length === 0) return;
    const oldest = workouts.reduce((a, b) => (a.date < b.date ? a : b)).date.slice(0, 10);
    const firstVisible = viewMode === 'month'
      ? dateToStr(monthDates[0]?.date ?? new Date())
      : dateToStr(weekDates[0] ?? new Date());
    if (firstVisible < oldest) void fetchOlderWorkouts(user.id);
  }, [user, viewMode, monthOffset, weekOffset, workouts, workoutsExhausted]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const start = new Date();
    start.setDate(start.getDate() - 90);
    supabase
      .from('nutrition_logs')
      .select('logged_at')
      .eq('user_id', user.id)
      .gte('logged_at', dateToStr(start))
      .then(({ data }) => {
        const dates = new Set((data ?? []).map(r => r.logged_at as string));
        setAllNutritionDates(dates);
      });
  }, [user]);

  useEffect(() => {
    if (!user || !selectedDate) return;
    const seq = ++summarySeq.current;
    setSummaryLoading(true);
    setSummaryError(false);

    Promise.all([
      supabase
        .from('workouts')
        .select('id, name, workout_exercises(id)')
        .eq('user_id', user.id)
        .gte('date', selectedDate)
        .lt('date', selectedDate + 'T23:59:59'),
      supabase
        .from('nutrition_logs')
        .select('calories, protein, carbs, fat, quantity, unit')
        .eq('user_id', user.id)
        .eq('logged_at', selectedDate),
      supabase
        .from('weight_measurements')
        .select('weight_kg')
        .eq('user_id', user.id)
        .eq('measured_at', selectedDate),
      supabase
        .from('daily_checkins')
        .select('notes')
        .eq('user_id', user.id)
        .eq('checked_at', selectedDate)
        .limit(1),
      supabase
        .from('body_measurements')
        .select('id')
        .eq('user_id', user.id)
        .eq('measured_at', selectedDate),
    ]).then(([workoutRes, nutritionRes, weightRes, checkinRes, measureRes]) => {
      if (seq !== summarySeq.current) return;
      if (responsesHaveError([workoutRes, nutritionRes, weightRes, checkinRes, measureRes])) {
        setSummaryError(true);
        setDaySummary(null);
        setSummaryLoading(false);
        return;
      }
      const nutritionLogs = ((nutritionRes.data ?? []) as Array<{
        calories: number; protein: number; carbs: number; fat: number; quantity?: number; unit?: string;
      }>).map(correctNutritionLogEnergy);
      const totalNutrition = nutritionLogs.length > 0 ? {
        totalCals: Math.round(nutritionLogs.reduce((s, l) => s + l.calories, 0)),
        protein: Math.round(nutritionLogs.reduce((s, l) => s + l.protein, 0)),
        carbs: Math.round(nutritionLogs.reduce((s, l) => s + l.carbs, 0)),
        fat: Math.round(nutritionLogs.reduce((s, l) => s + l.fat, 0)),
      } : null;
      setDaySummary({
        workouts: calendarDayWorkouts(workoutRes.data ?? [], t('workout.unnamed')),
        nutrition: totalNutrition,
        nutritionCount: nutritionLogs.length,
        weights: calendarDayWeights(weightRes.data ?? []),
        measurementCount: (measureRes.data ?? []).length,
        checkinNote: ((checkinRes.data ?? [])[0]?.notes as string | undefined)?.trim() || null,
      });
      setSummaryLoading(false);
    }).catch(() => {
      if (seq !== summarySeq.current) return;
      setSummaryError(true);
      setDaySummary(null);
      setSummaryLoading(false);
    });
  }, [user, selectedDate, t, summaryRetry]);

  const workoutDateSet = useMemo(() => {
    return new Set(workouts.map(w => dateToStr(parseDate(w.date))));
  }, [workouts]);

  const weightDateSet = useMemo(() => {
    return new Set(measurements.map(m => m.measured_at));
  }, [measurements]);


  const weekBaseDate = useMemo(() => {
    const [y, m, d] = today.split('-').map(Number);
    const base = new Date(y, m - 1, d);
    base.setDate(base.getDate() + weekOffset * 7);
    return base;
  }, [weekOffset, today]);

  const weekDates = useMemo(() => getWeekDates(weekBaseDate), [weekBaseDate]);

  const weekLabel = useMemo(() => {
    if (weekOffset === 0) return t('calendar.thisWeek');
    if (weekOffset === -1) return t('calendar.lastWeek');
    return `${weekDates[0].toLocaleDateString(dateLocale(i18n.language), { month: 'short', day: 'numeric' })} – ${weekDates[6].toLocaleDateString(dateLocale(i18n.language), { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, [weekDates, weekOffset, t, i18n.language]);

  const monthBaseDate = useMemo(() => {
    const [y, m] = today.split('-').map(Number);
    const base = new Date(y, m - 1, 1);
    base.setMonth(base.getMonth() + monthOffset);
    return base;
  }, [monthOffset, today]);

  const monthDates = useMemo(() => getMonthDates(monthBaseDate.getFullYear(), monthBaseDate.getMonth()), [monthBaseDate]);

  const monthLabel = useMemo(() => {
    return monthBaseDate.toLocaleDateString(dateLocale(i18n.language), { month: 'long', year: 'numeric' });
  }, [monthBaseDate, i18n.language]);

  const planByDate = useMemo(() => {
    const dates = viewMode === 'week' ? weekDates : monthDates.map(m => m.date);
    const map = new Map<string, PlanCalendarMark | null>();
    const program = assignment?.program;
    const liveDays = program?.days;
    const scheduledDays = program?.scheduled_snapshot
      ? parseRevisionSnapshot(program.scheduled_snapshot).map((day, index) => ({
        id: `scheduled-${index}`,
        weekday: day.weekday,
        name: day.name,
        phase_id: day.phase_id,
        exercises: day.exercises,
      }))
      : null;
    const scheduledPhases = program?.scheduled_snapshot
      ? snapshotToPhaseDrafts(program.scheduled_snapshot).map((phase, order_index) => ({
        id: phase.id ?? `scheduled-phase-${order_index}`,
        name: phase.name,
        description: phase.description ?? '',
        order_index,
        duration_weeks: phase.duration_weeks,
      }))
      : null;
    const scheduledOrg = program?.scheduled_snapshot
      ? parseRevisionOrganization(program.scheduled_snapshot)
      : null;
    const scheduledMeta = program?.scheduled_snapshot
      ? parseRevisionMeta(program.scheduled_snapshot)
      : {};
    const liveStart = phaseAnchorDate(assignment?.start_date, program?.phase_anchor_on);
    for (const d of dates) {
      const ds = dateToStr(d);
      const graph = programGraphForDate({
        date: ds,
        liveDays,
        livePhases: program?.phases,
        liveOrganization: program?.session_organization,
        liveDurationWeeks: program?.duration_weeks,
        liveVersionStart: program?.phase_anchor_on ?? null,
        assignmentStartDate: assignment?.start_date,
        scheduledActivatesOn: program?.scheduled_activates_on,
        scheduledDays,
        scheduledPhases,
        scheduledOrganization: scheduledOrg,
        scheduledDurationWeeks: scheduledMeta.duration_weeks,
      });
      map.set(ds, planMarkForDate({
        date: ds,
        days: graph.days,
        workouts,
        assignmentId: assignment?.id,
        startDate: graph.versionStart ?? assignment?.start_date,
        durationWeeks: graph.durationWeeks ?? program?.duration_weeks,
        assignmentStatus: assignment?.status,
        endedAt: assignment?.status === 'paused' || assignment?.status === 'completed'
          ? assignment.updated_at
          : null,
        unnamed: t('workout.unnamed'),
        sessionOrganization: graph.organization,
        phases: graph.phases,
        phaseAnchorDate: graph.versionStart ?? liveStart,
      }));
    }
    return map;
  }, [viewMode, weekDates, monthDates, assignment, workouts, t]);

  const selectedPlan = planByDate.get(selectedDate) ?? null;

  const buildDayData = (dates: Date[], inMonthFn?: (d: Date) => boolean): DayData[] =>
    dates.map(d => {
      const ds = dateToStr(d);
      return {
        date: ds,
        hasWorkout: workoutDateSet.has(ds),
        hasNutrition: allNutritionDates.has(ds),
        hasWeight: weightDateSet.has(ds),
        inCurrentPeriod: inMonthFn ? inMonthFn(d) : true,
      };
    });

  const weekDayData = buildDayData(weekDates);
  const monthDayData = buildDayData(
    monthDates.map(m => m.date),
    (d) => monthDates.find(m => dateToStr(m.date) === dateToStr(d))?.inMonth ?? true
  );

  const selectedDateLabel = useMemo(() => {
    const d = parseDateStr(selectedDate);
    return d.toLocaleDateString(dateLocale(i18n.language), { weekday: 'long', month: 'long', day: 'numeric' });
  }, [selectedDate, i18n.language]);

  const renderDayButton = (day: DayData) => {
    const isToday = day.date === today;
    const isSelected = day.date === selectedDate;
    const isFuture = day.date > today;
    const dimmed = day.inCurrentPeriod === false;
    const plan = planByDate.get(day.date) ?? null;
    const planDotClass = plan?.status === 'done'
      ? (isSelected ? 'bg-white/80' : 'bg-violet-400')
      : plan?.status === 'started'
        ? (isSelected ? 'border-white/80 bg-white/40' : 'border-violet-400 bg-violet-400/40')
        : (isSelected ? 'border-white/80' : 'border-violet-400');

    return (
      <button
        key={day.date}
        onClick={() => setSelectedDate(day.date)}
        data-testid={`calendar-day-${day.date}`}
        data-future={isFuture ? 'true' : 'false'}
        data-selected={isSelected ? 'true' : 'false'}
        className={`flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-all active:scale-95 cursor-pointer
          ${isSelected ? 'bg-blue-600 text-white' : isToday ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:bg-neutral-800/50'}
          ${dimmed ? 'opacity-30' : isFuture && !isSelected ? 'opacity-70' : ''}`}
      >
        <span className={`font-semibold ${viewMode === 'month' ? 'text-[11px]' : 'text-xs'}`}>
          {parseDateStr(day.date).getDate()}
        </span>
        <div className="flex gap-0.5">
          {plan ? (
            <div
              data-testid="ux47-plan-dot"
              data-plan-status={plan.status}
              data-date={day.date}
              className={`w-1.5 h-1.5 rounded-full ${plan.status === 'scheduled' || plan.status === 'started' ? 'border' : ''} ${planDotClass}`}
            />
          ) : null}
          {day.hasWorkout && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/80' : 'bg-blue-400'}`} />}
          {day.hasNutrition && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/80' : 'bg-emerald-400'}`} />}
          {day.hasWeight && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/80' : 'bg-amber-400'}`} />}
        </div>
      </button>
    );
  };

  return (
    <PageTransition>
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between mb-6 animate-fade-in-down">
        <h1 className="text-2xl font-bold text-white" data-testid="calendar-page">{t('calendar.title')}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'week' ? 'month' : 'week')}
            data-testid="calendar-view-toggle"
            aria-label={viewMode === 'week' ? t('calendar.showMonth') : t('calendar.showWeek')}
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-neutral-900 text-neutral-400 hover:text-white transition-colors"
          >
            {viewMode === 'week' ? <CalendarRange size={18} /> : <CalendarDays size={18} />}
          </button>
        </div>
      </div>

      <Card className="mb-4 animate-fade-in-scale">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => viewMode === 'week' ? setWeekOffset(o => o - 1) : setMonthOffset(o => o - 1)}
            data-testid="calendar-prev"
            aria-label={t('calendar.previous')}
            className="min-h-11 min-w-11 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-white" data-testid="calendar-period-label">
            {viewMode === 'week' ? weekLabel : monthLabel}
          </span>
          <button
            onClick={() => viewMode === 'week' ? setWeekOffset(o => o + 1) : setMonthOffset(o => o + 1)}
            data-testid="calendar-next"
            aria-label={t('calendar.next')}
            className="min-h-11 min-w-11 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {DAY_LABELS.map(l => (
            <div key={l} className="text-center text-[11px] font-medium text-neutral-500 mb-1">{l}</div>
          ))}
          {viewMode === 'week'
            ? weekDayData.map(renderDayButton)
            : monthDayData.map(renderDayButton)
          }
        </div>

        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 pt-3 border-t border-neutral-800"
          data-testid="calendar-plan-legend"
        >
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <div className="w-1.5 h-1.5 rounded-full border border-violet-400" />
            {t('calendar.plan.scheduled')}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <div className="w-1.5 h-1.5 rounded-full border border-violet-400 bg-violet-400/40" />
            {t('calendar.plan.started')}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            {t('calendar.plan.done')}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            {t('calendar.legend.workout')}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {t('calendar.legend.nutrition')}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            {t('calendar.legend.weight')}
          </div>
        </div>
      </Card>

      <div className="mb-3 animate-fade-in-up stagger-2">
        <h2 className="text-sm font-semibold text-neutral-300 mb-2">{selectedDateLabel}</h2>
        {selectedDate <= today && (
          <div className="flex flex-wrap gap-2">
            {showModule(tracking, 'workouts') && <button type="button" className="min-h-11 px-3 rounded-xl bg-neutral-900 text-sm text-white" onClick={() => {
              if (!user) return;
              void createWorkout({ user_id: user.id, name: '', date: `${selectedDate}T12:00:00` }).then((id) => {
                if (id) navigate(`/workout/${id}`);
              });
            }}>
              {t('calendar.day.addWorkout')}
            </button>}
            {showModule(tracking, 'nutrition') && <button type="button" className="min-h-11 px-3 rounded-xl bg-neutral-900 text-sm text-white" onClick={() => {
              setNutritionDate(selectedDate);
              navigate('/nutrition?add=1');
            }}>
              {t('calendar.day.addMeal')}
            </button>}
            {showModule(tracking, 'weight') && <button type="button" className="min-h-11 px-3 rounded-xl bg-neutral-900 text-sm text-white" onClick={() => navigate(`/weight?log=1&date=${selectedDate}`)}>
              {t('calendar.day.addWeight')}
            </button>}
            {showModule(tracking, 'checkins') && checkinHasAnyField(tracking) && <button type="button" className="min-h-11 px-3 rounded-xl bg-neutral-900 text-sm text-white" onClick={() => navigate(`/checkin?date=${selectedDate}`)}>
              {t('calendar.day.addCheckin')}
            </button>}
          </div>
        )}
      </div>

      {summaryError ? (
        <div className="space-y-3 mb-4">
          <p role="alert" className="text-sm text-rose-300">{t('calendar.loadError')}</p>
          <button
            type="button"
            onClick={() => setSummaryRetry(n => n + 1)}
            className="min-h-11 px-4 rounded-xl bg-neutral-800 text-white text-sm"
          >
            {t('errors.retry')}
          </button>
        </div>
      ) : summaryLoading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-neutral-800 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-neutral-800 rounded-md w-1/2" />
                  <div className="h-3 bg-neutral-800/70 rounded-md w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3 animate-fade-in-up stagger-3">
          {selectedPlan ? (
            <Card
              className={selectedPlan.workoutId ? 'cursor-pointer hover:border-neutral-700/70' : ''}
              onClick={selectedPlan.workoutId ? () => navigate(`/workout/${selectedPlan.workoutId}`) : undefined}
            >
              <div data-testid="ux47-plan-card" data-plan-status={selectedPlan.status}>
                <p className="text-[11px] uppercase tracking-wider text-violet-300">
                  {t(`calendar.plan.${selectedPlan.status}`)}
                </p>
                <p className="text-sm font-semibold text-white">{selectedPlan.dayName}</p>
                {selectedPlan.phaseName ? (
                  <p className="text-xs text-violet-300 mt-1" data-testid="calendar-plan-phase">
                    {t('programs.currentPhase', { name: selectedPlan.phaseName })}
                  </p>
                ) : null}
                {selectedPlan.status === 'scheduled' ? (
                  <p className="text-xs text-neutral-500 mt-1">{t('calendar.plan.dueHint')}</p>
                ) : null}
              </div>
            </Card>
          ) : null}
          {daySummary && daySummary.workouts.length > 0 ? (
            daySummary.workouts.map(workout => (
              <Card
                key={workout.id}
                className="flex items-center gap-3 cursor-pointer hover:border-neutral-700/70 active:scale-[0.98] transition-all"
                onClick={() => navigate(`/workout/${workout.id}`)}
              >
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 flex items-center justify-center shrink-0">
                  <Dumbbell size={16} className="text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{workout.name}</p>
                  <p className="text-xs text-neutral-500">
                    {workout.exerciseCount} {workout.exerciseCount !== 1 ? t('calendar.day.exercises') : t('calendar.day.exercise')}
                  </p>
                </div>
              </Card>
            ))
          ) : selectedPlan?.status === 'scheduled' ? null : (
            <Card className="flex items-center gap-3 border-dashed">
              <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center shrink-0">
                <Dumbbell size={16} className="text-neutral-500" />
              </div>
              <p className="text-sm text-neutral-400">{t('calendar.day.noWorkout')}</p>
            </Card>
          )}

          {daySummary?.nutrition ? (
            <Card
              className="cursor-pointer hover:border-neutral-700/70 active:scale-[0.98] transition-all"
              onClick={() => { setNutritionDate(selectedDate); navigate('/nutrition'); }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600/20 flex items-center justify-center shrink-0">
                  <Apple size={16} className="text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-sm font-semibold text-white">{daySummary.nutrition.totalCals} {t('common.kcal')}</p>
                    {profile?.daily_calorie_target && (
                      <p className="text-xs text-neutral-500">/ {profile.daily_calorie_target}</p>
                    )}
                  </div>
                  {profile?.daily_calorie_target && (
                    <div className="mt-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden w-full">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (daySummary.nutrition.totalCals / profile.daily_calorie_target) * 100)}%`,
                          backgroundColor: daySummary.nutrition.totalCals > profile.daily_calorie_target ? 'rgb(var(--c-rose-500))' : 'rgb(var(--c-emerald-500))',
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-neutral-800/50 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-xs font-bold text-blue-400">{daySummary.nutrition.protein}g</p>
                  <p className="text-[11px] text-neutral-500">{t('common.protein')}</p>
                </div>
                <div className="bg-neutral-800/50 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-xs font-bold text-amber-400">{daySummary.nutrition.carbs}g</p>
                  <p className="text-[11px] text-neutral-500">{t('common.carbs')}</p>
                </div>
                <div className="bg-neutral-800/50 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-xs font-bold text-rose-400">{daySummary.nutrition.fat}g</p>
                  <p className="text-[11px] text-neutral-500">{t('common.fat')}</p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="flex items-center gap-3 border-dashed">
              <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center shrink-0">
                <Apple size={16} className="text-neutral-500" />
              </div>
              <p className="text-sm text-neutral-400">{t('calendar.day.noNutrition')}</p>
            </Card>
          )}

          {daySummary && daySummary.weights.length > 0 ? (
            daySummary.weights.map((weight, index) => (
              <Card
                key={`${weight}-${index}`}
                className="flex items-center gap-3 cursor-pointer hover:border-neutral-700/70 active:scale-[0.98] transition-all"
                onClick={() => navigate('/weight')}
              >
                <div className="w-9 h-9 rounded-xl bg-amber-600/20 flex items-center justify-center shrink-0">
                  <Scale size={16} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{formatWeight(weight, unit)}</p>
                  <p className="text-xs text-neutral-500">{t('calendar.day.weightLogged')}</p>
                </div>
              </Card>
            ))
          ) : (
            <Card className="flex items-center gap-3 border-dashed">
              <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center shrink-0">
                <Scale size={16} className="text-neutral-500" />
              </div>
              <p className="text-sm text-neutral-400">{t('calendar.day.noWeight')}</p>
            </Card>
          )}
          {daySummary && daySummary.measurementCount > 0 && showModule(tracking, 'weight') ? (
            <Card
              className="flex items-center gap-3 cursor-pointer hover:border-neutral-700/70 active:scale-[0.98] transition-all"
              onClick={() => navigate('/body?view=measurements')}
            >
              <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center shrink-0">
                <Ruler size={16} className="text-neutral-300" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-white">
                {t('measurements.calendarEntry', { count: daySummary.measurementCount })}
              </p>
            </Card>
          ) : null}
          {daySummary?.checkinNote ? (
            <Card>
              <p className="text-sm font-semibold text-white mb-1">{t('calendar.day.checkin')}</p>
              <p className="text-sm text-neutral-300">{daySummary.checkinNote}</p>
            </Card>
          ) : null}
        </div>
      )}
    </div>
    </PageTransition>
  );
}
