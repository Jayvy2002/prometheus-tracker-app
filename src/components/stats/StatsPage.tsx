import { useEffect, useState, useMemo, useRef } from 'react';
import { ArrowLeft, Flame, Dumbbell, Droplets, Scale, TrendingUp, TrendingDown, Minus, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { supabase } from '../../lib/supabase';
import { toLocalDateStr, formatChartDate, formatNumber, formatSignedNumber, weightInUnit } from '../../lib/utils';
import { nutritionTargetsFromProfile } from '../../lib/nutritionTargets';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Area, AreaChart } from 'recharts';
import Card from '../ui/Card';
import CardLink from '../ui/CardLink';
import PageTransition from '../ui/PageTransition';
import { useClientTracking } from '../../lib/useClientTracking';
import { showModule, showNutritionField } from '../../lib/clientTracking';
import { averageLoggedCalories, averageLoggedValue, completedNutritionDays, statsCalorieSummary } from '../../lib/clientHome';
import { correctNutritionLogEnergy } from '../../lib/foodEnergy';
import { responsesHaveError } from '../../lib/progressSearch';

type Period = 'week' | 'month' | '3months';
type ChartTab = 'calories' | 'weight' | 'workouts';

interface DayNutrition {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water_ml: number;
}

interface WeightStat {
  date: string;
  weight: number;
}

function getPeriodDates(period: Period): { start: string; end: string; days: number } {
  const end = new Date();
  const start = new Date();
  let days = 7;
  if (period === 'week') { start.setDate(end.getDate() - 6); days = 7; }
  else if (period === 'month') { start.setDate(end.getDate() - 29); days = 30; }
  else { start.setDate(end.getDate() - 89); days = 90; }
  const fmt = (d: Date) => toLocalDateStr(d);
  return { start: fmt(start), end: fmt(end), days };
}

function getPrevPeriodDates(period: Period): { start: string; end: string } {
  const end = new Date();
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
  const prevEnd = new Date(end);
  prevEnd.setDate(end.getDate() - days);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - days + 1);
  const fmt = (d: Date) => toLocalDateStr(d);
  return { start: fmt(prevStart), end: fmt(prevEnd) };
}

function TrendBadge({ value }: { value: number | null }) {
  if (value === null || value === 0) return null;
  const isUp = value > 0;
  // Neutral either way: more or less than last period is information, not a grade.
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-neutral-800 text-neutral-300">
      {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {Math.abs(value)}%
    </span>
  );
}

export default function StatsPage({ embedded = false }: { embedded?: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const tracking = useClientTracking();
  const [period, setPeriod] = useState<Period>('week');
  const [chartTab, setChartTab] = useState<ChartTab>('calories');
  const [nutrition, setNutrition] = useState<DayNutrition[]>([]);
  const [workoutDates, setWorkoutDates] = useState<string[]>([]);
  const [weights, setWeights] = useState<WeightStat[]>([]);
  const [prevNutrition, setPrevNutrition] = useState<{ avgCalories: number; avgProtein: number; avgWater: number }>({ avgCalories: 0, avgProtein: 0, avgWater: 0 });
  const [prevWorkoutCount, setPrevWorkoutCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [appliedRange, setAppliedRange] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const unit = profile?.unit_weight ?? 'kg';
  const nutritionTargets = nutritionTargetsFromProfile(profile);
  const calorieTarget = nutritionTargets.calories ?? 0;
  const proteinTarget = nutritionTargets.protein ?? 0;
  const waterTarget = nutritionTargets.waterMl ?? 0;

  const PERIODS: { value: Period; label: string }[] = [
    { value: 'week', label: t('stats.periods.week') },
    { value: 'month', label: t('stats.periods.month') },
    { value: '3months', label: t('stats.periods.threeMonths') },
  ];

  const { start, end } = useMemo(() => getPeriodDates(period), [period]);
  const { start: prevStart, end: prevEnd } = useMemo(() => getPrevPeriodDates(period), [period]);

  useEffect(() => {
    if (!user) return;
    const seq = ++loadSeq.current;
    const rangeKey = `${start}|${end}`;
    setLoading(true);
    setLoadError(false);

    Promise.all([
      supabase.from('nutrition_logs').select('logged_at, calories, protein, carbs, fat, quantity, unit').eq('user_id', user.id).gte('logged_at', start).lte('logged_at', end),
      supabase.from('water_logs').select('logged_at, amount_ml').eq('user_id', user.id).gte('logged_at', start).lte('logged_at', end),
      supabase.from('workouts').select('date').eq('user_id', user.id).eq('completed', true).gte('date', start).lte('date', end + 'T23:59:59'),
      supabase.from('weight_measurements').select('measured_at, weight_kg').eq('user_id', user.id).gte('measured_at', start).lte('measured_at', end).order('measured_at', { ascending: true }),
      supabase.from('nutrition_logs').select('logged_at, calories, protein, carbs, fat, quantity, unit').eq('user_id', user.id).gte('logged_at', prevStart).lte('logged_at', prevEnd),
      supabase.from('water_logs').select('logged_at, amount_ml').eq('user_id', user.id).gte('logged_at', prevStart).lte('logged_at', prevEnd),
      supabase.from('workouts').select('date').eq('user_id', user.id).eq('completed', true).gte('date', prevStart).lte('date', prevEnd + 'T23:59:59'),
    ]).then(([nutRes, waterRes, wkRes, weightRes, prevNutRes, prevWaterRes, prevWkRes]) => {
      if (seq !== loadSeq.current) return;
      if (responsesHaveError([nutRes, waterRes, wkRes, weightRes, prevNutRes, prevWaterRes, prevWkRes])) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      const nutritionLogs = ((nutRes.data ?? []) as Array<{
        logged_at: string; calories: number; protein: number; carbs: number; fat: number; quantity?: number; unit?: string;
      }>).map(correctNutritionLogEnergy);
      const waterLogs = (waterRes.data ?? []) as { logged_at: string; amount_ml: number }[];

      const byDate: Record<string, DayNutrition> = {};
      for (const log of nutritionLogs) {
        const d = log.logged_at;
        if (!byDate[d]) byDate[d] = { date: d, calories: 0, protein: 0, carbs: 0, fat: 0, water_ml: 0 };
        byDate[d].calories += log.calories;
        byDate[d].protein += log.protein;
        byDate[d].carbs += log.carbs;
        byDate[d].fat += log.fat;
      }
      for (const w of waterLogs) {
        const d = w.logged_at;
        if (!byDate[d]) byDate[d] = { date: d, calories: 0, protein: 0, carbs: 0, fat: 0, water_ml: 0 };
        byDate[d].water_ml += w.amount_ml;
      }
      setNutrition(Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)));

      const wkDates = (wkRes.data ?? []).map((w: { date: string }) => w.date.split('T')[0]);
      setWorkoutDates(wkDates);

      setWeights((weightRes.data ?? []).map((w: { measured_at: string; weight_kg: number }) => ({
        date: w.measured_at,
        weight: weightInUnit(w.weight_kg, unit),
      })));

      const prevNutLogs = ((prevNutRes.data ?? []) as Array<{
        logged_at: string; calories: number; protein: number; carbs?: number; fat?: number; quantity?: number; unit?: string;
      }>).map(row => correctNutritionLogEnergy({
        ...row,
        carbs: row.carbs ?? 0,
        fat: row.fat ?? 0,
      }));
      const prevWaterLogs = (prevWaterRes.data ?? []) as { logged_at: string; amount_ml: number }[];
      const prevNutByDate: Record<string, { calories: number; protein: number }> = {};
      for (const log of prevNutLogs) {
        if (!prevNutByDate[log.logged_at]) prevNutByDate[log.logged_at] = { calories: 0, protein: 0 };
        prevNutByDate[log.logged_at].calories += log.calories;
        prevNutByDate[log.logged_at].protein += log.protein;
      }
      const prevNutDays = Object.values(prevNutByDate);
      const prevWaterByDate: Record<string, number> = {};
      for (const w of prevWaterLogs) {
        prevWaterByDate[w.logged_at] = (prevWaterByDate[w.logged_at] ?? 0) + w.amount_ml;
      }
      const prevWaterDays = Object.values(prevWaterByDate);

      setPrevNutrition({
        avgCalories: prevNutDays.length > 0 ? Math.round(prevNutDays.reduce((s, d) => s + d.calories, 0) / prevNutDays.length) : 0,
        avgProtein: prevNutDays.length > 0 ? Math.round(prevNutDays.reduce((s, d) => s + d.protein, 0) / prevNutDays.length) : 0,
        avgWater: prevWaterDays.length > 0 ? Math.round(prevWaterDays.reduce((s, v) => s + v, 0) / prevWaterDays.length) : 0,
      });
      setPrevWorkoutCount((prevWkRes.data ?? []).length);
      setAppliedRange(rangeKey);
      setLoading(false);
    }).catch(() => {
      if (seq !== loadSeq.current) return;
      setLoadError(true);
      setLoading(false);
    });
  }, [user, start, end, prevStart, prevEnd, unit, retry]);

  const rangeKey = `${start}|${end}`;
  const statsReady = appliedRange === rangeKey;

  // Computed stats — kcal average ignores water-only zeros so we never invent a fake deficit.
  // The day in progress is left out: a half-logged day is not a low day.
  const todayCivil = toLocalDateStr(new Date());
  const completedDays = completedNutritionDays(nutrition, todayCivil);
  const calorieStats = averageLoggedCalories(completedDays);
  const avgCalories = calorieStats.avg;
  // Absent ≠ 0: a day without protein or water logs is not a 0 g / 0 L day.
  const proteinStats = averageLoggedValue(completedDays, 'protein');
  const waterStats = averageLoggedValue(completedDays, 'water_ml');
  const avgProtein = Math.round(proteinStats.avg);
  const avgWater = Math.round(waterStats.avg);
  const totalWorkouts = workoutDates.length;
  const uniqueWorkoutDays = new Set(workoutDates).size;

  const weightChange = weights.length >= 2
    ? Math.round((weights[weights.length - 1].weight - weights[0].weight) * 10) / 10
    : null;

  // Deltas
  const pctDelta = (curr: number, prev: number) => prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);
  const calorieDelta = pctDelta(avgCalories, prevNutrition.avgCalories);
  const proteinDelta = pctDelta(avgProtein, prevNutrition.avgProtein);
  const waterDelta = pctDelta(avgWater, prevNutrition.avgWater);
  const workoutDelta = pctDelta(totalWorkouts, prevWorkoutCount);

  // Chart data
  const calorieChartData = nutrition.map(d => ({
    date: formatChartDate(d.date, i18n.language),
    value: Math.round(d.calories),
    target: calorieTarget,
  }));

  const weightChartData = weights.map(w => ({
    date: formatChartDate(w.date, i18n.language),
    value: w.weight,
  }));

  const workoutByWeek = useMemo(() => {
    const weeks: Record<string, number> = {};
    for (const d of workoutDates) {
      const date = new Date(d);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const key = toLocalDateStr(weekStart);
      weeks[key] = (weeks[key] ?? 0) + 1;
    }
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({
        date: formatChartDate(date, i18n.language),
        value: count,
      }));
  }, [workoutDates, i18n.language]);

  const CHART_TABS: { key: ChartTab; label: string }[] = [
    ...(showNutritionField(tracking, 'calories') ? [{ key: 'calories' as const, label: t('stats.chartTabs.calories') }] : []),
    ...(showModule(tracking, 'weight') ? [{ key: 'weight' as const, label: t('stats.chartTabs.weight') }] : []),
    ...(showModule(tracking, 'workouts') ? [{ key: 'workouts' as const, label: t('stats.chartTabs.workouts') }] : []),
  ];

  useEffect(() => {
    if (CHART_TABS.length > 0 && !CHART_TABS.some(tab => tab.key === chartTab)) {
      setChartTab(CHART_TABS[0].key);
    }
  }, [chartTab, tracking]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeChartData = chartTab === 'calories' ? calorieChartData : chartTab === 'weight' ? weightChartData : workoutByWeek;

  // Natural language summary
  function buildSummary(): string {
    if (!calorieStats.hasLogs && totalWorkouts === 0) return t(nutrition.length > 0 ? 'stats.summaryDayInProgress' : 'stats.summaryEmpty');
    const parts: string[] = [];
    if (showNutritionField(tracking, 'calories')) {
      const gap = statsCalorieSummary({ days: completedDays, calorieTarget });
      if (gap?.kind === 'on_target') parts.push(t('stats.summaryCaloriesOnTarget'));
      else if (gap?.kind === 'above') parts.push(t('stats.summaryCaloriesAbove', { pct: gap.pct }));
      else if (gap?.kind === 'below') parts.push(t('stats.summaryCaloriesBelow', { pct: gap.pct }));
    }
    if (totalWorkouts > 0 && showModule(tracking, 'workouts')) parts.push(t('stats.summaryWorkouts', { count: totalWorkouts }));
    if (parts.length === 0) return t('stats.summaryEmpty');
    return parts.join(' ');
  }

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5 animate-fade-in-down">
          {!embedded && (
            <button type="button" aria-label={t('common.back')} onClick={() => navigate(-1)} className="min-h-11 min-w-11 -ml-2 text-neutral-400 hover:text-white transition-colors">
              <ArrowLeft size={20} className="mx-auto" />
            </button>
          )}
          <h1 className="text-xl font-bold text-white flex-1" data-testid="stats-page">{t('stats.title')}</h1>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 bg-neutral-900 rounded-xl p-1 mb-5 animate-fade-in-scale">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`flex-1 min-h-11 rounded-lg text-sm font-medium transition-all
                ${period === p.value ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {loadError && !statsReady ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-rose-300">{t('stats.loadError')}</p>
            <button
              type="button"
              onClick={() => setRetry(n => n + 1)}
              className="min-h-11 px-4 rounded-xl bg-neutral-800 text-white text-sm"
            >
              {t('errors.retry')}
            </button>
          </div>
        ) : loading && !statsReady ? (
          <div className="text-center py-16 text-neutral-500">{t('common.loading')}</div>
        ) : (
          <div className="space-y-4">
            {loadError && (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-rose-300">{t('stats.loadError')}</p>
                <button
                  type="button"
                  onClick={() => setRetry(n => n + 1)}
                  className="min-h-11 px-4 rounded-xl bg-neutral-800 text-white text-sm"
                >
                  {t('errors.retry')}
                </button>
              </div>
            )}
            {/* Summary card */}
            <div className="bg-gradient-to-br from-blue-600/10 to-transparent border border-blue-500/15 rounded-2xl p-4 animate-fade-in-up">
              <p className="text-sm text-neutral-300 leading-relaxed">{buildSummary()}</p>
            </div>

            {/* Key metrics grid */}
            <div className="grid grid-cols-2 gap-3 animate-fade-in-up stagger-2">
              {showNutritionField(tracking, 'calories') && calorieStats.hasLogs && (
              <Card>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center">
                    <Flame size={14} className="text-orange-400" />
                  </div>
                  <TrendBadge value={calorieDelta} />
                </div>
                <p className="text-xl font-bold text-white">{formatNumber(avgCalories, { maxDigits: 0 })}</p>
                <p className="text-[11px] text-neutral-500">{t('stats.labels.avgCalories')}</p>
                {calorieTarget > 0 && (
                  <p className="text-[11px] text-neutral-600 mt-0.5">{t('common.target')}: {formatNumber(calorieTarget, { maxDigits: 0 })}</p>
                )}
              </Card>
              )}

              {showModule(tracking, 'workouts') && (
              <Card>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
                    <Dumbbell size={14} className="text-blue-400" />
                  </div>
                  <TrendBadge value={workoutDelta} />
                </div>
                <p className="text-xl font-bold text-white">{totalWorkouts}</p>
                <p className="text-[11px] text-neutral-500">{t('stats.labels.workouts')}</p>
                <p className="text-[11px] text-neutral-600 mt-0.5">{uniqueWorkoutDays} {t('stats.differentDays')}</p>
              </Card>
              )}

              {showNutritionField(tracking, 'protein') && proteinStats.hasLogs && (
              <Card>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
                    <TrendingUp size={14} className="text-amber-400" />
                  </div>
                  <TrendBadge value={proteinDelta} />
                </div>
                <p className="text-xl font-bold text-white">{avgProtein} g</p>
                <p className="text-[11px] text-neutral-500">{t('stats.labels.avgProtein')}</p>
                {proteinTarget > 0 && (
                  <p className="text-[11px] text-neutral-600 mt-0.5">{t('common.target')}: {proteinTarget} g</p>
                )}
              </Card>
              )}

              {showNutritionField(tracking, 'water') && waterStats.hasLogs && (
              <Card>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                    <Droplets size={14} className="text-cyan-400" />
                  </div>
                  <TrendBadge value={waterDelta} />
                </div>
                <p className="text-xl font-bold text-white">{formatNumber(avgWater / 1000)} L</p>
                <p className="text-[11px] text-neutral-500">{t('stats.labels.avgWater')}</p>
                {waterTarget > 0 && (
                  <p className="text-[11px] text-neutral-600 mt-0.5">{t('common.target')}: {formatNumber(waterTarget / 1000)} L</p>
                )}
              </Card>
              )}
            </div>

            {/* Weight change */}
            {showModule(tracking, 'weight') && weightChange !== null && (
              <Card className="animate-fade-in-up stagger-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                    <Scale size={16} className="text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-neutral-500">{t('stats.labels.weightChange')}</p>
                    <p className="text-lg font-bold text-white">
                      {formatSignedNumber(weightChange)} {unit}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg
                    ${weightChange === 0 ? 'bg-neutral-800 text-neutral-400' :
                      (weightChange < 0 && profile?.goal === 'lose') || (weightChange > 0 && profile?.goal === 'gain')
                        ? 'bg-emerald-500/10 text-emerald-400' : 'bg-neutral-800 text-neutral-400'}`}>
                    {weightChange > 0 ? <TrendingUp size={12} /> : weightChange < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                    {formatNumber(weights[0].weight)} → {formatNumber(weights[weights.length - 1].weight)}
                  </div>
                </div>
              </Card>
            )}

            {/* Chart section */}
            {activeChartData.length > 1 && (
              <Card className="animate-fade-in-up stagger-4">
                <div className="flex gap-1 bg-neutral-800/50 rounded-lg p-0.5 mb-4">
                  {CHART_TABS.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setChartTab(tab.key)}
                      className={`flex-1 py-1.5 rounded-md text-[11px] font-medium transition-all
                        ${chartTab === tab.key ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartTab === 'calories' ? (
                      <BarChart data={calorieChartData} barSize={period === '3months' ? 4 : period === 'month' ? 8 : 16}>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#949494' }} axisLine={false} tickLine={false}
                          interval={period === '3months' ? 6 : period === 'month' ? 4 : 0} />
                        <YAxis tick={{ fontSize: 10, fill: '#949494' }} axisLine={false} tickLine={false} width={32} />
                        <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', fontSize: 11 }} />
                        <Bar dataKey="value" fill="#2563eb" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    ) : chartTab === 'weight' ? (
                      <AreaChart data={weightChartData}>
                        <defs>
                          <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#949494' }} axisLine={false} tickLine={false}
                          interval={period === '3months' ? 6 : period === 'month' ? 4 : 0} />
                        <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 10, fill: '#949494' }} axisLine={false} tickLine={false} width={35} />
                        <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', fontSize: 11 }} />
                        <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#weightGrad)" dot={{ r: 3, fill: '#10b981' }} />
                      </AreaChart>
                    ) : (
                      <BarChart data={workoutByWeek} barSize={24}>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#949494' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#949494' }} axisLine={false} tickLine={false} width={20} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', fontSize: 11 }} />
                        <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            <CardLink to="/exercise-progress" className="flex items-center gap-3 animate-fade-in-up">
              <Dumbbell size={16} className="text-blue-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{t('dashboard.viewProgress')}</p>
                <p className="text-xs text-neutral-500">{t('dashboard.progressDesc')}</p>
              </div>
              <ChevronRight size={16} className="text-neutral-600" />
            </CardLink>

            {nutrition.length === 0 && totalWorkouts === 0 && weights.length === 0 && (
              <Card className="text-center py-12">
                <TrendingUp className="mx-auto mb-3 text-neutral-600" size={32} />
                <p className="text-neutral-400">{t('stats.charts.noData')}</p>
              </Card>
            )}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
