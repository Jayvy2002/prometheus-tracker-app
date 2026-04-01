import { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Dumbbell, Apple, Scale } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
}

interface DaySummary {
  workout: { name: string; exerciseCount: number } | null;
  nutrition: { totalCals: number; protein: number; carbs: number; fat: number } | null;
  weight: number | null;
}

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

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const { workouts, fetchWorkouts } = useWorkoutStore();
  const { measurements, fetchMeasurements } = useWeightStore();
  const { setSelectedDate: setNutritionDate } = useNutritionStore();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(dateToStr(new Date()));
  const [nutritionDates, setNutritionDates] = useState<Set<string>>(new Set());
  const [daySummary, setDaySummary] = useState<DaySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const unit = profile?.unit_weight ?? 'kg';

  const baseDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate]);

  const weekStart = dateToStr(weekDates[0]);
  const weekEnd = dateToStr(weekDates[6]);

  useEffect(() => {
    if (!user) return;
    fetchWorkouts(user.id);
    fetchMeasurements(user.id);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('nutrition_logs')
      .select('logged_at')
      .eq('user_id', user.id)
      .gte('logged_at', weekStart)
      .lte('logged_at', weekEnd)
      .then(({ data }) => {
        const dates = new Set((data ?? []).map(r => r.logged_at as string));
        setNutritionDates(dates);
      });
  }, [user, weekStart, weekEnd]);

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
      let workoutExCount = 0;
      if (workoutRes.data) {
        supabase
          .from('workout_exercises')
          .select('id', { count: 'exact', head: true })
          .eq('workout_id', workoutRes.data.id)
          .then(({ count }) => {
            workoutExCount = count ?? 0;
            const nutritionLogs = (nutritionRes.data ?? []) as { calories: number; protein: number; carbs: number; fat: number }[];
            const totalNutrition = nutritionLogs.length > 0 ? {
              totalCals: Math.round(nutritionLogs.reduce((s, l) => s + l.calories, 0)),
              protein: Math.round(nutritionLogs.reduce((s, l) => s + l.protein, 0)),
              carbs: Math.round(nutritionLogs.reduce((s, l) => s + l.carbs, 0)),
              fat: Math.round(nutritionLogs.reduce((s, l) => s + l.fat, 0)),
            } : null;

            setDaySummary({
              workout: workoutRes.data ? { name: workoutRes.data.name || 'Workout', exerciseCount: workoutExCount } : null,
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
    return new Set(workouts.map(w => {
      const d = parseDate(w.date);
      return dateToStr(d);
    }));
  }, [workouts]);

  const weightDateSet = useMemo(() => {
    return new Set(measurements.map(m => m.measured_at));
  }, [measurements]);

  const today = dateToStr(new Date());
  const weekLabel = useMemo(() => {
    const start = weekDates[0];
    const end = weekDates[6];
    if (weekOffset === 0) return 'This Week';
    if (weekOffset === -1) return 'Last Week';
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, [weekDates, weekOffset]);

  const selectedDateLabel = useMemo(() => {
    const d = parseDateStr(selectedDate);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }, [selectedDate]);

  const dayData: DayData[] = weekDates.map(d => {
    const ds = dateToStr(d);
    return {
      date: ds,
      hasWorkout: workoutDateSet.has(ds),
      hasNutrition: nutritionDates.has(ds),
      hasWeight: weightDateSet.has(ds),
    };
  });

  return (
    <PageTransition>
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold text-white mb-6 animate-fade-in-down">Calendar</h1>

      <Card className="mb-4 animate-fade-in-scale">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setWeekOffset(o => o - 1)}
            className="p-2 text-neutral-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-white">{weekLabel}</span>
          <button
            onClick={() => setWeekOffset(o => Math.min(0, o + 1))}
            disabled={weekOffset >= 0}
            className="p-2 text-neutral-400 hover:text-white transition-colors disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {DAY_LABELS.map(l => (
            <div key={l} className="text-center text-[10px] font-medium text-neutral-500 mb-1">{l}</div>
          ))}
          {dayData.map((day) => {
            const isToday = day.date === today;
            const isSelected = day.date === selectedDate;
            const isFuture = day.date > today;
            return (
              <button
                key={day.date}
                onClick={() => !isFuture && setSelectedDate(day.date)}
                disabled={isFuture}
                className={`flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all active:scale-95
                  ${isSelected ? 'bg-blue-600 text-white' : isToday ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:bg-neutral-800/50'}
                  ${isFuture ? 'opacity-30 cursor-default' : 'cursor-pointer'}`}
              >
                <span className="text-xs font-semibold">{parseDateStr(day.date).getDate()}</span>
                <div className="flex gap-0.5">
                  {day.hasWorkout && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/80' : 'bg-blue-400'}`} />}
                  {day.hasNutrition && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/80' : 'bg-emerald-400'}`} />}
                  {day.hasWeight && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/80' : 'bg-amber-400'}`} />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-neutral-800">
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Workout
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Nutrition
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Weight
          </div>
        </div>
      </Card>

      {/* Weekly summary */}
      <div className="grid grid-cols-3 gap-2 mb-4 animate-fade-in-up stagger-2">
        <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-blue-400">{dayData.filter(d => d.hasWorkout).length}</p>
          <p className="text-[10px] text-neutral-500">Workouts</p>
        </div>
        <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-emerald-400">{dayData.filter(d => d.hasNutrition).length}</p>
          <p className="text-[10px] text-neutral-500">Days logged</p>
        </div>
        <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-amber-400">{dayData.filter(d => d.hasWeight).length}</p>
          <p className="text-[10px] text-neutral-500">Weigh-ins</p>
        </div>
      </div>

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
                <p className="text-xs text-neutral-500">{daySummary.workout.exerciseCount} exercise{daySummary.workout.exerciseCount !== 1 ? 's' : ''}</p>
              </div>
            </Card>
          ) : (
            <Card className="flex items-center gap-3 opacity-40">
              <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center shrink-0">
                <Dumbbell size={16} className="text-neutral-500" />
              </div>
              <p className="text-sm text-neutral-500">No workout logged</p>
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
                    <p className="text-sm font-semibold text-white">{daySummary.nutrition.totalCals} kcal</p>
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
                  <p className="text-[10px] text-neutral-500">Protein</p>
                </div>
                <div className="bg-neutral-800/50 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-xs font-bold text-amber-400">{daySummary.nutrition.carbs}g</p>
                  <p className="text-[10px] text-neutral-500">Carbs</p>
                </div>
                <div className="bg-neutral-800/50 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-xs font-bold text-rose-400">{daySummary.nutrition.fat}g</p>
                  <p className="text-[10px] text-neutral-500">Fat</p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="flex items-center gap-3 opacity-40">
              <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center shrink-0">
                <Apple size={16} className="text-neutral-500" />
              </div>
              <p className="text-sm text-neutral-500">No nutrition logged</p>
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
                <p className="text-xs text-neutral-500">Weight logged</p>
              </div>
            </Card>
          ) : (
            <Card className="flex items-center gap-3 opacity-40">
              <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center shrink-0">
                <Scale size={16} className="text-neutral-500" />
              </div>
              <p className="text-sm text-neutral-500">No weight logged</p>
            </Card>
          )}
        </div>
      )}
    </div>
    </PageTransition>
  );
}
