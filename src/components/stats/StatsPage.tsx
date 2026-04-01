import { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Flame, Dumbbell, Droplets, Scale } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { supabase } from '../../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line } from 'recharts';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import FullPageLayout from '../layout/FullPageLayout';

type Period = 'week' | 'month' | '3months';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: '3months', label: '3 Months' },
];

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

function StatCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: React.ElementType;
  trend?: number | null;
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
        </div>
        {trend !== null && trend !== undefined && (
          <div className={`flex items-center gap-0.5 text-xs font-medium px-2 py-1 rounded-lg
            ${trend > 0 ? 'bg-emerald-500/10 text-emerald-400' : trend < 0 ? 'bg-rose-500/10 text-rose-400' : 'bg-neutral-800 text-neutral-500'}`}>
            {trend > 0 ? <TrendingUp size={11} /> : trend < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
    </Card>
  );
}

export default function StatsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const [period, setPeriod] = useState<Period>('week');
  const [nutrition, setNutrition] = useState<DayNutrition[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutStat[]>([]);
  const [weights, setWeights] = useState<WeightStat[]>([]);
  const [loading, setLoading] = useState(true);
  const unit = profile?.unit_weight ?? 'kg';

  const { start, end } = useMemo(() => getPeriodDates(period), [period]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    Promise.all([
      supabase
        .from('nutrition_logs')
        .select('logged_at, calories, protein, carbs, fat')
        .eq('user_id', user.id)
        .gte('logged_at', start)
        .lte('logged_at', end),
      supabase
        .from('water_logs')
        .select('logged_at, amount_ml')
        .eq('user_id', user.id)
        .gte('logged_at', start)
        .lte('logged_at', end),
      supabase
        .from('workouts')
        .select('date')
        .eq('user_id', user.id)
        .gte('date', start)
        .lte('date', end + 'T23:59:59'),
      supabase
        .from('weight_measurements')
        .select('measured_at, weight_kg')
        .eq('user_id', user.id)
        .gte('measured_at', start)
        .lte('measured_at', end)
        .order('measured_at', { ascending: true }),
    ]).then(([nutritionRes, waterRes, workoutsRes, weightRes]) => {
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

      setLoading(false);
    });
  }, [user, start, end, unit]);

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
  const calorieTrend = avgCalories > 0 && calorieTarget > 0
    ? Math.round(((avgCalories - calorieTarget) / calorieTarget) * 100)
    : null;

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

  return (
    <FullPageLayout>
    <PageTransition>
    <div className="px-4 pt-6 pb-24">
      <div className="flex items-center gap-3 mb-6 animate-fade-in-down">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-white flex-1">Statistics</h1>
      </div>

      <div className="flex gap-1 bg-neutral-900 rounded-xl p-1 mb-6 animate-fade-in-scale">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all
              ${period === p.value ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-neutral-500">Loading...</div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 animate-fade-in-up stagger-2">
            <StatCard
              label="Avg. Calories"
              value={`${avgCalories}`}
              sub={`target: ${calorieTarget}`}
              color="bg-rose-500/20 text-rose-400"
              icon={Flame}
              trend={calorieTrend}
            />
            <StatCard
              label="Workouts"
              value={`${totalWorkouts}`}
              sub={period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'last 3 months'}
              color="bg-blue-500/20 text-blue-400"
              icon={Dumbbell}
              trend={null}
            />
            <StatCard
              label="Avg. Protein"
              value={`${avgProtein}g`}
              sub={`target: ${profile?.protein_target ?? 0}g`}
              color="bg-amber-500/20 text-amber-400"
              icon={TrendingUp}
              trend={null}
            />
            <StatCard
              label="Avg. Water"
              value={`${(avgWater / 1000).toFixed(1)}L`}
              sub={`target: ${((profile?.daily_water_target_ml ?? 2000) / 1000).toFixed(1)}L`}
              color="bg-sky-500/20 text-sky-400"
              icon={Droplets}
              trend={null}
            />
          </div>

          {weightChange !== null && (
            <div className="animate-fade-in-up stagger-3">
              <StatCard
                label="Weight Change"
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
              <h3 className="text-sm font-medium text-neutral-400 mb-3">Daily Calories</h3>
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
              <h3 className="text-sm font-medium text-neutral-400 mb-3">Macros Breakdown</h3>
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
                  <div className="w-2 h-2 rounded-full bg-blue-500" /> Protein
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <div className="w-2 h-2 rounded-full bg-amber-500" /> Carbs
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <div className="w-2 h-2 rounded-full bg-rose-500" /> Fat
                </div>
              </div>
            </Card>
          )}

          {weightChartData.length > 1 && (
            <Card className="animate-fade-in-up stagger-5">
              <h3 className="text-sm font-medium text-neutral-400 mb-3">Weight Trend ({unit})</h3>
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
              <p className="text-neutral-400">No data logged for this period yet</p>
            </Card>
          )}
        </div>
      )}
    </div>
    </PageTransition>
    </FullPageLayout>
  );
}
