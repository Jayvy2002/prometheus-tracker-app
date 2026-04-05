import { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Dumbbell, Apple, Scale, Flame, CalendarDays, CalendarRange } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useWeightStore } from '../../stores/weightStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import { supabase } from '../../lib/supabase';
import { parseDateStr, parseDate, formatWeight } from '../../lib/utils';
import { useProfileStore } from '../../stores/profileStore';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';

interface DayData {
  date: string;
  hasWorkout: boolean;
  hasNutrition: boolean;
  hasWeight: boolean;
  inCurrentPeriod?: boolean;
}

interface DaySummary {
  workout: { name: string; exerciseCount: number } | null;
  nutrition: { totalCals: number; protein: number; carbs: number; fat: number } | null;
  weight: number | null;
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const { workouts, fetchWorkouts } = useWorkoutStore();
  const { measurements, fetchMeasurements } = useWeightStore();
  const { setSelectedDate: setNutritionDate } = useNutritionStore();

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
  const [selectedDate, setSelectedDate] = useState(dateToStr(new Date()));
  const [allNutritionDates, setAllNutritionDates] = useState<Set<string>>(new Set());
  const [daySummary, setDaySummary] = useState<DaySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const unit = profile?.unit_weight ?? 'kg';

  useEffect(() => {
    if (!user) return;
    fetchWorkouts(user.id);
    fetchMeasurements(user.id);
  }, [user]);

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
    setSummaryLoading(true);

    Promise.all([
      supabase
        .from('workouts')
        .select('id, name')
        .eq('user_id', user.id)
        .gte('date', selectedDate)
        .lt('date', selectedDate + 'T23:59:59')
        .maybeSingle(),
      supabase
        .from('nutrition_logs')
        .select('calories, protein, carbs, fat')
        .eq('user_id', user.id)
        .eq('logged_at', selectedDate),
      supabase
        .from('weight_measurements')
        .select('weight_kg')
        .eq('user_id', user.id)
        .eq('measured_at', selectedDate)
        .maybeSingle(),
    ]).then(([workoutRes, nutritionRes, weightRes]) => {
      if (workoutRes.data) {
        supabase
          .from('workout_exercises')
          .select('id', { count: 'exact', head: true })
          .eq('workout_id', workoutRes.data.id)
          .then(({ count }) => {
            const nutritionLogs = (nutritionRes.data ?? []) as { calories: number; protein: number; carbs: number; fat: number }[];
            const totalNutrition = nutritionLogs.length > 0 ? {
              totalCals: Math.round(nutritionLogs.reduce((s, l) => s + l.calories, 0)),
              protein: Math.round(nutritionLogs.reduce((s, l) => s + l.protein, 0)),
              carbs: Math.round(nutritionLogs.reduce((s, l) => s + l.carbs, 0)),
              fat: Math.round(nutritionLogs.reduce((s, l) => s + l.fat, 0)),
            } : null;
            setDaySummary({
              workout: workoutRes.data ? { name: workoutRes.data.name || 'Workout', exerciseCount: count ?? 0 } : null,
              nutrition: totalNutrition,
              weight: weightRes.data ? weightRes.data.weight_kg : null,
            });
            setSummaryLoading(false);
          });
      } else {
        const nutritionLogs = (nutritionRes.data ?? []) as { calories: number; protein: number; carbs: number; fat: number }[];
        const totalNutrition = nutritionLogs.length > 0 ? {
          totalCals: Math.round(nutritionLogs.reduce((s, l) => s + l.calories, 0)),
          protein: Math.round(nutritionLogs.reduce((s, l) => s + l.protein, 0)),
          carbs: Math.round(nutritionLogs.reduce((s, l) => s + l.carbs, 0)),
          fat: Math.round(nutritionLogs.reduce((s, l) => s + l.fat, 0)),
        } : null;
        setDaySummary({
          workout: null,
          nutrition: totalNutrition,
          weight: weightRes.data ? weightRes.data.weight_kg : null,
        });
        setSummaryLoading(false);
      }
    });
  }, [user, selectedDate]);

  const workoutDateSet = useMemo(() => {
    return new Set(workouts.map(w => dateToStr(parseDate(w.date))));
  }, [workouts]);

  const weightDateSet = useMemo(() => {
    return new Set(measurements.map(m => m.measured_at));
  }, [measurements]);

  const streakCount = useMemo(() => {
    const todayDate = dateToStr(new Date());
    const allLogged = new Set([...workoutDateSet, ...weightDateSet, ...allNutritionDates]);
    let startDate = todayDate;
    if (!allLogged.has(todayDate)) {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      startDate = dateToStr(y);
    }
    if (!allLogged.has(startDate)) return 0;
    let count = 0;
    const cur = new Date(startDate + 'T12:00:00');
    for (let i = 0; i < 365; i++) {
      if (!allLogged.has(dateToStr(cur))) break;
      count++;
      cur.setDate(cur.getDate() - 1);
    }
    return count;
  }, [workoutDateSet, weightDateSet, allNutritionDates]);

  const weekBaseDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekDates = useMemo(() => getWeekDates(weekBaseDate), [weekBaseDate]);

  const weekLabel = useMemo(() => {
    if (weekOffset === 0) return t('calendar.thisWeek');
    if (weekOffset === -1) return t('calendar.lastWeek');
    return `${weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, [weekDates, weekOffset, t]);

  const monthBaseDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const monthDates = useMemo(() => getMonthDates(monthBaseDate.getFullYear(), monthBaseDate.getMonth()), [monthBaseDate]);

  const monthLabel = useMemo(() => {
    return monthBaseDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [monthBaseDate]);

  const today = dateToStr(new Date());

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
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }, [selectedDate]);

  const renderDayButton = (day: DayData) => {
    const isToday = day.date === today;
    const isSelected = day.date === selectedDate;
    const isFuture = day.date > today;
    const dimmed = day.inCurrentPeriod === false;

    return (
      <button
        key={day.date}
        onClick={() => !isFuture && setSelectedDate(day.date)}
        className={`flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-all active:scale-95
          ${isSelected ? 'bg-blue-600 text-white' : isToday ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:bg-neutral-800/50'}
          ${isFuture || dimmed ? 'opacity-30' : 'cursor-pointer'}`}
      >
        <span className={`font-semibold ${viewMode === 'month' ? 'text-[11px]' : 'text-xs'}`}>
          {parseDateStr(day.date).getDate()}
        </span>
        <div className="flex gap-0.5">
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
        <h1 className="text-2xl font-bold text-white">{t('calendar.title')}</h1>
        <div className="flex items-center gap-2">
          {streakCount > 0 && (
            <div className="flex items-center gap-1 bg-orange-500/15 border border-orange-500/25 rounded-xl px-2.5 py-1.5">
              <Flame size={13} className="text-orange-400" />
              <span className="text-xs font-bold text-orange-400">{streakCount}</span>
            </div>
          )}
          <button
            onClick={() => setViewMode(viewMode === 'week' ? 'month' : 'week')}
            className="p-2 rounded-xl bg-neutral-900 text-neutral-400 hover:text-white transition-colors"
          >
            {viewMode === 'week' ? <CalendarRange size={18} /> : <CalendarDays size={18} />}
          </button>
        </div>
      </div>

      <Card className="mb-4 animate-fade-in-scale">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => viewMode === 'week' ? setWeekOffset(o => o - 1) : setMonthOffset(o => o - 1)}
            className="p-2 text-neutral-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-white">
            {viewMode === 'week' ? weekLabel : monthLabel}
          </span>
          <button
            onClick={() => viewMode === 'week' ? setWeekOffset(o => o + 1) : setMonthOffset(o => o + 1)}
            className="p-2 text-neutral-400 hover:text-white transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {DAY_LABELS.map(l => (
            <div key={l} className="text-center text-[10px] font-medium text-neutral-500 mb-1">{l}</div>
          ))}
          {viewMode === 'week'
            ? weekDayData.map(renderDayButton)
            : monthDayData.map(renderDayButton)
          }
        </div>

        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-neutral-800">
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
          {streakCount > 0 && (
            <div className="ml-auto flex items-center gap-1 text-[11px] text-orange-400">
              <Flame size={11} />
              <span>{t('calendar.legend.streak', { n: streakCount })}</span>
            </div>
          )}
        </div>
      </Card>

      {viewMode === 'week' && (
        <div className="grid grid-cols-3 gap-2 mb-4 animate-fade-in-up stagger-2">
          <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-xl px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-blue-400">{weekDayData.filter(d => d.hasWorkout).length}</p>
            <p className="text-[10px] text-neutral-500">{t('calendar.weekSummary.workouts')}</p>
          </div>
          <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-xl px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-emerald-400">{weekDayData.filter(d => d.hasNutrition).length}</p>
            <p className="text-[10px] text-neutral-500">{t('calendar.weekSummary.daysLogged')}</p>
          </div>
          <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-xl px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-amber-400">{weekDayData.filter(d => d.hasWeight).length}</p>
            <p className="text-[10px] text-neutral-500">{t('calendar.weekSummary.weighIns')}</p>
          </div>
        </div>
      )}

      <div className="mb-3 animate-fade-in-up stagger-2">
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-1">{selectedDateLabel}</h2>
      </div>

      {summaryLoading ? (
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
          {daySummary?.workout ? (
            <Card
              className="flex items-center gap-3 cursor-pointer hover:border-neutral-700/70 active:scale-[0.98] transition-all"
              onClick={() => navigate('/workout')}
            >
              <div className="w-9 h-9 rounded-xl bg-blue-600/20 flex items-center justify-center shrink-0">
                <Dumbbell size={16} className="text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{daySummary.workout.name}</p>
                <p className="text-xs text-neutral-500">
                  {daySummary.workout.exerciseCount} {daySummary.workout.exerciseCount !== 1 ? t('calendar.day.exercises') : t('calendar.day.exercise')}
                </p>
              </div>
            </Card>
          ) : (
            <Card className="flex items-center gap-3 opacity-40">
              <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center shrink-0">
                <Dumbbell size={16} className="text-neutral-500" />
              </div>
              <p className="text-sm text-neutral-500">{t('calendar.day.noWorkout')}</p>
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
                          backgroundColor: daySummary.nutrition.totalCals > profile.daily_calorie_target ? '#f43f5e' : '#10b981',
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-neutral-800/50 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-xs font-bold text-blue-400">{daySummary.nutrition.protein}g</p>
                  <p className="text-[10px] text-neutral-500">{t('common.protein')}</p>
                </div>
                <div className="bg-neutral-800/50 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-xs font-bold text-amber-400">{daySummary.nutrition.carbs}g</p>
                  <p className="text-[10px] text-neutral-500">{t('common.carbs')}</p>
                </div>
                <div className="bg-neutral-800/50 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-xs font-bold text-rose-400">{daySummary.nutrition.fat}g</p>
                  <p className="text-[10px] text-neutral-500">{t('common.fat')}</p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="flex items-center gap-3 opacity-40">
              <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center shrink-0">
                <Apple size={16} className="text-neutral-500" />
              </div>
              <p className="text-sm text-neutral-500">{t('calendar.day.noNutrition')}</p>
            </Card>
          )}

          {daySummary?.weight ? (
            <Card
              className="flex items-center gap-3 cursor-pointer hover:border-neutral-700/70 active:scale-[0.98] transition-all"
              onClick={() => navigate('/weight')}
            >
              <div className="w-9 h-9 rounded-xl bg-amber-600/20 flex items-center justify-center shrink-0">
                <Scale size={16} className="text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{formatWeight(daySummary.weight, unit)}</p>
                <p className="text-xs text-neutral-500">{t('calendar.day.weightLogged')}</p>
              </div>
            </Card>
          ) : (
            <Card className="flex items-center gap-3 opacity-40">
              <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center shrink-0">
                <Scale size={16} className="text-neutral-500" />
              </div>
              <p className="text-sm text-neutral-500">{t('calendar.day.noWeight')}</p>
            </Card>
          )}
        </div>
      )}
    </div>
    </PageTransition>
  );
}
