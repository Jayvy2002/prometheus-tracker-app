import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, X, Check, Info, Flame, Minus } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useWeightStore } from '../../stores/weightStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import { parseDateStr, calculateMacros } from '../../lib/utils';
import { toast } from '../ui/Toast';
import Button from '../ui/Button';

const MIN_WEIGH_INS = 4;
const WINDOW_DAYS = 14;

function getRollingAvg(
  measurements: { weight_kg: number; measured_at: string }[],
  daysAgo: number,
  windowDays: number
): { avg: number | null; count: number; dataPoints: { date: string; weight: number }[] } {
  const now = new Date();
  const end = new Date(now);
  end.setDate(now.getDate() - daysAgo);
  const start = new Date(end);
  start.setDate(end.getDate() - windowDays);

  const inWindow = measurements.filter(m => {
    const d = parseDateStr(m.measured_at);
    return d >= start && d <= end;
  });

  if (inWindow.length === 0) return { avg: null, count: 0, dataPoints: [] };

  const dataPoints = inWindow
    .map(m => ({ date: m.measured_at, weight: m.weight_kg }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    avg: inWindow.reduce((s, m) => s + m.weight_kg, 0) / inWindow.length,
    count: inWindow.length,
    dataPoints,
  };
}

function getDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function WeightSparkline({ data }: { data: { date: string; weight: number }[] }) {
  if (data.length < 2) return null;
  const weights = data.map(d => d.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 0.5;
  const W = 72, H = 22, PAD = 2;

  const pointList = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - 2 * PAD);
    const y = (H - PAD) - ((d.weight - minW) / range) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pts = pointList.join(' ');

  const firstWeight = data[0].weight;
  const lastWeight = data[data.length - 1].weight;
  const isDown = lastWeight < firstWeight;
  const strokeColor = isDown ? '#34d399' : '#f87171'; // green if going down (cut context)

  const lastPt = pointList[pointList.length - 1].split(',');
  const lastCx = parseFloat(lastPt[0]);
  const lastCy = parseFloat(lastPt[1]);

  return (
    <svg width={W} height={H} className="shrink-0 opacity-80">
      <polyline
        points={pts}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={lastCx}
        cy={lastCy}
        r="2"
        fill={strokeColor}
      />
    </svg>
  );
}

interface Props {
  onDismiss: () => void;
}

export default function WeeklyAdjustment({ onDismiss }: Props) {
  const { user } = useAuthStore();
  const { profile, updateProfile } = useProfileStore();
  const { measurements } = useWeightStore();
  const { fetchCaloriesForRange } = useNutritionStore();
  const [saving, setSaving] = useState(false);
  const [calorieAdherence, setCalorieAdherence] = useState<number | null>(null);

  const goal = profile?.goal ?? 'maintain';
  const currentCalories = profile?.daily_calorie_target ?? 2000;

  const { avg: avgCurrent, count: countCurrent, dataPoints: dpCurrent } = getRollingAvg(measurements, 0, WINDOW_DAYS);
  const { avg: avgPrev, count: countPrev } = getRollingAvg(measurements, WINDOW_DAYS, WINDOW_DAYS);
  const totalWeighIns = countCurrent + countPrev;

  // Fetch average caloric intake for the current 14-day window
  useEffect(() => {
    if (!user) return;
    const start = getDateNDaysAgo(WINDOW_DAYS);
    const end = getDateNDaysAgo(0);
    fetchCaloriesForRange(user.id, start, end).then(rows => {
      if (rows.length === 0) return;
      // Group by day and sum, then average across days with data
      const byDay: Record<string, number> = {};
      for (const r of rows) {
        byDay[r.logged_at] = (byDay[r.logged_at] ?? 0) + r.calories;
      }
      const days = Object.values(byDay);
      if (days.length === 0) return;
      const avgIntake = days.reduce((s, v) => s + v, 0) / days.length;
      setCalorieAdherence(avgIntake / currentCalories);
    });
  }, [user?.id, currentCalories]); // eslint-disable-line react-hooks/exhaustive-deps

  if (avgCurrent === null || avgPrev === null || totalWeighIns < MIN_WEIGH_INS) return null;

  const weekDiff = avgCurrent - avgPrev;
  const absDiff = Math.abs(weekDiff);

  let suggestion: number | null = null;
  let message = '';
  let reason = '';
  let severity: 'warning' | 'info' | 'success' = 'info';

  // Factor caloric adherence into the suggestion
  const isUnderEating = calorieAdherence !== null && calorieAdherence < 0.85;
  const isOverEating = calorieAdherence !== null && calorieAdherence > 1.15;

  if (goal === 'cut') {
    if (absDiff < 0.2) {
      if (isUnderEating) {
        // Under-eating but not losing — adherence issue, not calorie target
        message = 'Weight stable but you\'re under your calorie target.';
        reason = 'Try being more consistent with your intake before adjusting the target.';
        severity = 'info';
        // No calorie suggestion — it's an adherence problem
      } else {
        suggestion = currentCalories - 100;
        message = 'Weight hasn\'t changed over the last 2 weeks.';
        reason = 'Reduce by 100 kcal to maintain your cutting deficit.';
        severity = 'warning';
      }
    } else if (weekDiff < -1) {
      suggestion = currentCalories + 100;
      message = `Losing too fast (${weekDiff.toFixed(1)} kg / 2 weeks).`;
      reason = 'Increase by 100 kcal to preserve muscle mass.';
      severity = 'warning';
    } else if (weekDiff > 0.3) {
      if (isOverEating) {
        message = `Weight up ${absDiff.toFixed(1)} kg — you're over your target by ${Math.round((calorieAdherence! - 1) * 100)}%.`;
        reason = 'Focus on hitting your current target before lowering it further.';
        severity = 'warning';
      } else {
        suggestion = currentCalories - 150;
        message = `Weight increased +${absDiff.toFixed(1)} kg over 2 weeks.`;
        reason = 'Reduce by 150 kcal to get back on track.';
        severity = 'warning';
      }
    } else if (weekDiff >= -1 && weekDiff <= -0.2) {
      // Good progress
      message = `Good pace: −${absDiff.toFixed(1)} kg over 2 weeks.`;
      reason = 'Keep your current target — you\'re losing at a healthy rate.';
      severity = 'success';
    }
  } else if (goal === 'bulk') {
    if (weekDiff < 0.1) {
      suggestion = currentCalories + 100;
      message = 'Weight isn\'t increasing over the last 2 weeks.';
      reason = 'Add 100 kcal to support muscle growth.';
      severity = 'info';
    } else if (weekDiff > 0.6) {
      suggestion = currentCalories - 100;
      message = `Gaining too fast (+${absDiff.toFixed(1)} kg / 2 weeks).`;
      reason = 'Reduce by 100 kcal to limit fat gain.';
      severity = 'warning';
    } else {
      message = `On track: +${absDiff.toFixed(1)} kg over 2 weeks.`;
      reason = 'Lean bulk pace is optimal. Maintain your current target.';
      severity = 'success';
    }
  } else if (goal === 'maintain') {
    if (absDiff > 0.5) {
      const dir = weekDiff > 0 ? -1 : 1;
      suggestion = currentCalories + dir * 100;
      message = `Weight ${weekDiff > 0 ? 'increased' : 'decreased'} by ${absDiff.toFixed(1)} kg.`;
      reason = `${dir > 0 ? 'Increase' : 'Reduce'} by 100 kcal to stabilize.`;
      severity = 'info';
    } else {
      message = `Weight is stable (±${absDiff.toFixed(2)} kg).`;
      reason = 'Your maintenance target is working well.';
      severity = 'success';
    }
  }

  // If no actionable message was generated at all, don't show
  if (!message) return null;
  // For success messages with no suggestion, we still show (as positive feedback)
  // but only for a limited time — they can dismiss

  const newMacros = suggestion ? calculateMacros(suggestion, goal) : null;

  const handleAccept = async () => {
    if (!user || suggestion === null) return;
    setSaving(true);
    await updateProfile(user.id, {
      daily_calorie_target: suggestion,
      protein_target: newMacros!.protein,
      carbs_target: newMacros!.carbs,
      fat_target: newMacros!.fat,
    });
    toast('Calorie target updated');
    setSaving(false);
    onDismiss();
  };

  const borderColor = severity === 'warning' ? 'border-amber-500/30' : severity === 'success' ? 'border-emerald-500/30' : 'border-blue-500/30';
  const bgColor = severity === 'warning' ? 'bg-amber-500/8' : severity === 'success' ? 'bg-emerald-500/8' : 'bg-blue-500/8';
  const iconBg = severity === 'warning' ? 'bg-amber-500/20 text-amber-400' : severity === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400';

  const TrendIcon = weekDiff > 0.05 ? TrendingUp : weekDiff < -0.05 ? TrendingDown : Minus;

  return (
    <div className={`mb-4 rounded-2xl border p-4 animate-fade-in-scale ${bgColor} ${borderColor}`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
          <TrendIcon size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-snug">{message}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{reason}</p>

          {suggestion !== null && newMacros && (
            <p className="text-xs text-neutral-500 mt-1.5">
              Suggested target:{' '}
              <span className="font-semibold text-white">{suggestion} kcal</span>
              <span className="text-neutral-600"> · P:{newMacros.protein}g C:{newMacros.carbs}g F:{newMacros.fat}g</span>
            </p>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Info size={9} className="text-neutral-600 shrink-0" />
              <p className="text-[10px] text-neutral-600">
                {totalWeighIns} weigh-ins · {avgPrev.toFixed(1)} → {avgCurrent.toFixed(1)} kg
              </p>
            </div>
            {calorieAdherence !== null && (
              <div className="flex items-center gap-1">
                <Flame size={9} className={calorieAdherence < 0.85 ? 'text-blue-500' : calorieAdherence > 1.15 ? 'text-rose-400' : 'text-emerald-500'} />
                <p className="text-[10px] text-neutral-600">
                  Avg intake: <span className={`font-medium ${calorieAdherence < 0.85 ? 'text-blue-400' : calorieAdherence > 1.15 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {Math.round(calorieAdherence * 100)}% of target
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <button onClick={onDismiss} className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors">
            <X size={14} />
          </button>
          {dpCurrent.length >= 2 && (
            <WeightSparkline data={dpCurrent} />
          )}
        </div>
      </div>

      {suggestion !== null && (
        <div className="flex gap-2 mt-3">
          <Button variant="secondary" onClick={onDismiss} size="sm" className="flex-1">Ignore</Button>
          <Button onClick={handleAccept} loading={saving} size="sm" className="flex-1">
            <Check size={14} /> Apply {suggestion} kcal
          </Button>
        </div>
      )}
      {suggestion === null && (
        <div className="mt-3 flex justify-end">
          <button onClick={onDismiss} className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">Dismiss</button>
        </div>
      )}
    </div>
  );
}
