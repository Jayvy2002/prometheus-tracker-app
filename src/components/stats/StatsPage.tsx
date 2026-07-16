import { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Flame, Dumbbell, Droplets, Scale, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { supabase } from '../../lib/supabase';
import { usePremium } from '../../hooks/usePremium';
import { usePaywallStore } from '../../stores/paywallStore';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line } from 'recharts';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';

type Period = 'week' | 'month' | '3months';

interface DayNutrition {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water_ml: number;
}

interface WorkoutStat {
  date: string;
  count: number;
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

  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { start: fmt(start), end: fmt(end), days };
}

function getPrevPeriodDates(period: Period): { start: string; end: string } {
  const end = new Date();
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
  const prevEnd = new Date(end);
  prevEnd.setDate(end.getDate() - days);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - days + 1);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { start: fmt(prevStart), end: fmt(prevEnd) };
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function StatCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
  trend,
  insight,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: React.ElementType;
  trend?: number | null;
  insight?: string | null;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-neutral-500">{label}</p>
          <p className="text-xl font-bold text-white leading-tight">{value}</p>
          {sub && <p className="text-xs text-neutral-500 mt-0.5">{sub}</p>}
          {insight && <p className="text-[11px] text-neutral-500 mt-1 italic">{insight}</p>}
        </div>
        {trend !== null && trend !== undefined && (
          <div className={`flex items-center gap-0.5 text-xs font-medium px-2 py-1 rounded-lg shrink-0
            ${trend > 0 ? 'bg-emerald-500/10 text-emerald-400' : trend < 0 ? 'bg-rose-500/10 text-rose-400' : 'bg-neutral-800 text-neutral-500'}`}>
            {trend > 0 ? <TrendingUp size={11} /> : trend < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
    </Card>
  );
}

export default function StatsPage({ embedded }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const { canUseStatsPeriod } = usePremium();
  const { openPaywall } = usePaywallStore();
  const [period, setPeriod] = useState<Period>('week');
  const [nutrition, setNutrition] = useState<DayNutrition[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutStat[]>([]);
  const [weights, setWeights] = useState<WeightStat[]>([]);
  const [prevAvgCalories, setPrevAvgCalories] = useState<number>(0);
  const [prevAvgProtein, setPrevAvgProtein] = useState<number>(0);
  const [prevAvgWater, setPrevAvgWater] = useState<number>(0);
  const [prevTotalWorkouts, setPrevTotalWorkouts] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const unit = profile?.unit_weight ?? 'kg';

  const PERIODS: { value: Period; label: string }[] = [
    { value: 'week', label: t('stats.periods.week') },
    { value: 'month', label: t('stats.periods.month') },
    { value: '3months', label: t('stats.periods.threeMonths') },
  ];

  const { start, end } = useMemo(() => getPeriodDates(period), [period]);
  const { start: prevStart, end: prevEnd } = useMemo(() => getPrevPeriodDates(period), [period]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);

    Promise.all([
      supabase.from('nutrition_logs').select('logged_at, calories, protein, carbs, fat').eq('user_id', user.id).gte('logged_at', start).lte('logged_at', end),
      supabase.from('water_logs').select('logged_at, amount_ml').eq('user_id', user.id).gte('logged_at', start).lte('logged_at', end),
      supabase.from('workouts').select('date').eq('user_id', user.id).gte('date', start).lte('date', end + 'T23:59:59'),
      supabase.from('weight_measurements').select('measured_at, weight_kg').eq('user_id', user.id).gte('measured_at', start).lte('measured_at', end).order('measured_at', { ascending: true }),
      // Previous period
      supabase.from('nutrition_logs').select('logged_at, calories, protein').eq('user_id', user.id).gte('logged_at', prevStart).lte('logged_at', prevEnd),
      supabase.from('water_logs').select('logged_at, amount_ml').eq('user_id', user.id).gte('logged_at', prevStart).lte('logged_at', prevEnd),
      supabase.from('workouts').select('date').eq('user_id', user.id).gte('date', prevStart).lte('date', prevEnd + 'T23:59:59'),
    ]).then(([nutritionRes, waterRes, workoutsRes, weightRes, prevNutRes, prevWaterRes, prevWkRes]) => {
      const nutritionLogs = (nutritionRes.data ?? []) as { logged_at: string; calories: number; protein: number; carbs: number; fat: number }[];
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

      const wkByDate: Record<string, number> = {};
      for (const w of (workoutsRes.data ?? []) as { date: string }[]) {
        const d = w.date.split('T')[0];
        wkByDate[d] = (wkByDate[d] ?? 0) + 1;
      }
      setWorkouts(Object.entries(wkByDate).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)));

      setWeights((weightRes.data ?? []).map((w: { measured_at: string; weight_kg: number }) => ({
        date: w.measured_at,
        weight: unit === 'lbs' ? +(w.weight_kg * 2.20462).toFixed(1) : +w.weight_kg.toFixed(1),
      })));

      // Previous period aggregates
      const prevNutLogs = (prevNutRes.data ?? []) as { logged_at: string; calories: number; protein: number }[];
      const prevNutByDate: Record<string, { calories: number; protein: number }> = {};
      for (const log of prevNutLogs) {
        const d = log.logged_at;
        if (!prevNutByDate[d]) prevNutByDate[d] = { calories: 0, protein: 0 };
        prevNutByDate[d].calories += log.calories;
        prevNutByDate[d].protein += log.protein;
      }
      const prevNutDays = Object.values(prevNutByDate);
      setPrevAvgCalories(prevNutDays.length > 0 ? Math.round(prevNutDays.reduce((s, d) => s + d.calories, 0) / prevNutDays.length) : 0);
      setPrevAvgProtein(prevNutDays.length > 0 ? Math.round(prevNutDays.reduce((s, d) => s + d.protein, 0) / prevNutDays.length) : 0);

      const prevWaterLogs = (prevWaterRes.data ?? []) as { logged_at: string; amount_ml: number }[];
      const prevWaterByDate: Record<string, number> = {};
      for (const w of prevWaterLogs) {
        prevWaterByDate[w.logged_at] = (prevWaterByDate[w.logged_at] ?? 0) + w.amount_ml;
      }
      const prevWaterDays = Object.values(prevWaterByDate);
      setPrevAvgWater(prevWaterDays.length > 0 ? Math.round(prevWaterDays.reduce((s, v) => s + v, 0) / prevWaterDays.length) : 0);

      const prevWkCount = (prevWkRes.data ?? []).length;
      setPrevTotalWorkouts(prevWkCount);

      setLoading(false);
    }).catch(() => {
      setLoadError(true);
      setLoading(false);
    });
  }, [user, start, end, prevStart, prevEnd, unit]);

  const avgCalories = nutrition.length > 0
    ? Math.round(nutrition.reduce((s, d) => s + d.calories, 0) / nutrition.length)
    : 0;

  const totalWorkouts = workouts.reduce((s, d) => s + d.count, 0);

  const avgProtein = nutrition.length > 0
    ? Math.round(nutrition.reduce((s, d) => s + d.protein, 0) / nutrition.length)
    : 0;

  const avgWater = nutrition.length > 0
    ? Math.round(nutrition.reduce((s, d) => s + d.water_ml, 0) / nutrition.length)
    : 0;

  const weightChange = weights.length >= 2
    ? +(weights[weights.length - 1].weight - weights[0].weight).toFixed(1)
    : null;

  const calorieTarget = profile?.daily_calorie_target ?? 2000;
  const proteinTarget = profile?.protein_target ?? 0;
  const waterTarget = profile?.daily_water_target_ml ?? 2000;

  // Period-over-period deltas (premium only)
  const { isPremium } = usePremium();
  const calorieDelta = isPremium ? pctDelta(avgCalories, prevAvgCalories) : null;
  const proteinDelta = isPremium ? pctDelta(avgProtein, prevAvgProtein) : null;
  const waterDelta = isPremium ? pctDelta(avgWater, prevAvgWater) : null;
  const workoutDelta = isPremium ? pctDelta(totalWorkouts, prevTotalWorkouts) : null;

  function calorieInsight(): string | null {
    if (!avgCalories || !calorieTarget) return null;
    const diff = avgCalories - calorieTarget;
    const pct = Math.abs(Math.round((diff / calorieTarget) * 100));
    if (pct <= 5) return t('stats.rightOnTarget');
    if (diff > 0) return t('stats.aboveTarget', { pct });
    return t('stats.belowTarget', { pct });
  }
  function proteinInsight(): string | null {
    if (!avgProtein || !proteinTarget) return null;
    const diff = avgProtein - proteinTarget;
    const pct = Math.abs(Math.round((diff / proteinTarget) * 100));
    if (pct <= 5) return t('stats.rightOnTarget');
    if (diff > 0) return t('stats.aboveTarget', { pct });
    return t('stats.belowTarget', { pct });
  }
  function waterInsight(): string | null {
    if (!avgWater || !waterTarget) return null;
    const diff = avgWater - waterTarget;
    const pct = Math.abs(Math.round((diff / waterTarget) * 100));
    if (pct <= 10) return t('stats.rightOnTarget');
    if (diff > 0) return t('stats.aboveTarget', { pct });
    return t('stats.belowTarget', { pct });
  }

  const periodLabel = period === 'week' ? t('stats.periodLabels.thisWeek') : period === 'month' ? t('stats.periodLabels.thisMonth') : t('stats.periodLabels.last3Months');

  const calorieChartData = nutrition.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    calories: Math.round(d.calories),
    target: calorieTarget,
  }));

  const macroChartData = nutrition.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    protein: Math.round(d.protein),
    carbs: Math.round(d.carbs),
    fat: Math.round(d.fat),
  }));

  const weightChartData = weights.map(w => ({
    date: new Date(w.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weight: w.weight,
  }));

  const Wrapper = embedded ? ({ children }: { children: React.ReactNode }) => <>{children}</> : PageTransition;

  return (
    <Wrapper>
    <div className={embedded ? "px-4 pb-24" : "px-4 pt-6 pb-24"}>
      {!embedded && (
      <div className="flex items-center gap-3 mb-6 animate-fade-in-down">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-white flex-1">{t('stats.title')}</h1>
      </div>
      )}

      <div className="flex gap-1 bg-neutral-900 rounded-xl p-1 mb-6 animate-fade-in-scale">
        {PERIODS.map(p => {
          const locked = !canUseStatsPeriod(p.value);
          return (
            <button
              key={p.value}
              onClick={() => {
                if (locked) {
                  openPaywall(t('premium.features.advancedStats'), t('stats.premiumPeriodDesc'));
                  return;
                }
                setPeriod(p.value);
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1
                ${period === p.value ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              {p.label}
              {locked && <Crown size={9} className="text-amber-400 shrink-0" />}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-16 text-neutral-500">{t('common.loading')}</div>
      ) : loadError ? (
        <div className="text-center py-16 text-neutral-500">{t('common.tryAgain')}</div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 animate-fade-in-up stagger-2">
            <StatCard
              label={t('stats.labels.avgCalories')}
              value={`${avgCalories}`}
              sub={`${t('stats.target')} ${calorieTarget}`}
              color="bg-rose-500/20 text-rose-400"
              icon={Flame}
              trend={calorieDelta}
              insight={calorieInsight()}
            />
            <StatCard
              label={t('stats.labels.workouts')}
              value={`${totalWorkouts}`}
              sub={periodLabel}
              color="bg-blue-500/20 text-blue-400"
              icon={Dumbbell}
              trend={workoutDelta}
            />
            <StatCard
              label={t('stats.labels.avgProtein')}
              value={`${avgProtein}g`}
              sub={`${t('stats.target')} ${proteinTarget}g`}
              color="bg-amber-500/20 text-amber-400"
              icon={TrendingUp}
              trend={proteinDelta}
              insight={proteinInsight()}
            />
            <StatCard
              label={t('stats.labels.avgWater')}
              value={`${(avgWater / 1000).toFixed(1)}L`}
              sub={`${t('stats.target')} ${(waterTarget / 1000).toFixed(1)}L`}
              color="bg-sky-500/20 text-sky-400"
              icon={Droplets}
              trend={waterDelta}
              insight={waterInsight()}
            />
          </div>

          {weightChange !== null && (
            <div className="animate-fade-in-up stagger-3">
              <StatCard
                label={t('stats.labels.weightChange')}
                value={weightChange > 0 ? `+${weightChange} ${unit}` : `${weightChange} ${unit}`}
                sub={`${weights[0]?.weight} → ${weights[weights.length - 1]?.weight} ${unit}`}
                color="bg-emerald-500/20 text-emerald-400"
                icon={Scale}
                trend={null}
              />
            </div>
          )}

          {calorieChartData.length > 1 && (
            <Card className="animate-fade-in-up stagger-3">
              <h3 className="text-sm font-medium text-neutral-400 mb-3">{t('stats.charts.dailyCalories')}</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={calorieChartData} barSize={period === '3months' ? 4 : 12}>
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#737373' }} axisLine={false} tickLine={false}
                      interval={period === '3months' ? 6 : period === 'month' ? 4 : 0} />
                    <YAxis tick={{ fontSize: 9, fill: '#737373' }} axisLine={false} tickLine={false} width={32} />
                    <Tooltip
                      contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', fontSize: 11 }}
                    />
                    <Bar dataKey="calories" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {macroChartData.length > 1 && (
            <Card className="animate-fade-in-up stagger-4">
              <h3 className="text-sm font-medium text-neutral-400 mb-3">{t('stats.charts.macrosBreakdown')}</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={macroChartData} barSize={period === '3months' ? 3 : 8}>
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#737373' }} axisLine={false} tickLine={false}
                      interval={period === '3months' ? 6 : period === 'month' ? 4 : 0} />
                    <YAxis tick={{ fontSize: 9, fill: '#737373' }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip
                      contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', fontSize: 11 }}
                    />
                    <Bar dataKey="protein" fill="#3b82f6" radius={[2, 2, 0, 0]} stackId="a" />
                    <Bar dataKey="carbs" fill="#f59e0b" radius={[0, 0, 0, 0]} stackId="a" />
                    <Bar dataKey="fat" fill="#f43f5e" radius={[0, 0, 2, 2]} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <div className="w-2 h-2 rounded-full bg-blue-500" /> {t('stats.legend.protein')}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <div className="w-2 h-2 rounded-full bg-amber-500" /> {t('stats.legend.carbs')}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <div className="w-2 h-2 rounded-full bg-rose-500" /> {t('stats.legend.fat')}
                </div>
              </div>
            </Card>
          )}

          {weightChartData.length > 1 && (
            <Card className="animate-fade-in-up stagger-5">
              <h3 className="text-sm font-medium text-neutral-400 mb-3">{t('stats.charts.weightTrend', { unit })}</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weightChartData}>
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#737373' }} axisLine={false} tickLine={false}
                      interval={period === '3months' ? 6 : period === 'month' ? 4 : 0} />
                    <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 9, fill: '#737373' }} axisLine={false} tickLine={false} width={35} />
                    <Tooltip
                      contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', fontSize: 11 }}
                    />
                    <Line type="monotone" dataKey="weight" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {nutrition.length === 0 && workouts.length === 0 && weights.length === 0 && (
            <Card className="text-center py-12">
              <TrendingUp className="mx-auto mb-3 text-neutral-600" size={32} />
              <p className="text-neutral-400">{t('stats.charts.noData')}</p>
            </Card>
          )}
        </div>
      )}
    </div>
    </Wrapper>
  );
}
