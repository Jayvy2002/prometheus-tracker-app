import { useState } from 'react';
import { TrendingUp, TrendingDown, X, Check, Info } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useWeightStore } from '../../stores/weightStore';
import { parseDateStr } from '../../lib/utils';
import { calculateMacros } from '../../lib/utils';
import { toast } from '../ui/Toast';
import Button from '../ui/Button';

const MIN_WEIGH_INS = 5;
const WINDOW_DAYS = 14;

function getRollingAvg(
  measurements: { weight_kg: number; measured_at: string }[],
  daysAgo: number,
  windowDays: number
): { avg: number | null; count: number } {
  const now = new Date();
  const end = new Date(now);
  end.setDate(now.getDate() - daysAgo);
  const start = new Date(end);
  start.setDate(end.getDate() - windowDays);

  const inWindow = measurements.filter(m => {
    const d = parseDateStr(m.measured_at);
    return d >= start && d <= end;
  });

  if (inWindow.length === 0) return { avg: null, count: 0 };
  return {
    avg: inWindow.reduce((s, m) => s + m.weight_kg, 0) / inWindow.length,
    count: inWindow.length,
  };
}

interface Props {
  onDismiss: () => void;
}

export default function WeeklyAdjustment({ onDismiss }: Props) {
  const { user } = useAuthStore();
  const { profile, updateProfile } = useProfileStore();
  const { measurements } = useWeightStore();
  const [saving, setSaving] = useState(false);

  const goal = profile?.goal ?? 'maintain';
  const currentCalories = profile?.daily_calorie_target ?? 2000;

  const { avg: avgCurrent, count: countCurrent } = getRollingAvg(measurements, 0, WINDOW_DAYS);
  const { avg: avgPrev, count: countPrev } = getRollingAvg(measurements, WINDOW_DAYS, WINDOW_DAYS);

  const totalWeighIns = countCurrent + countPrev;

  // Require minimum weigh-ins for a reliable suggestion
  if (avgCurrent === null || avgPrev === null || totalWeighIns < MIN_WEIGH_INS) return null;

  const weekDiff = avgCurrent - avgPrev;
  const absDiff = Math.abs(weekDiff);

  let suggestion: number | null = null;
  let message = '';
  let reason = '';
  let severity: 'warning' | 'info' = 'info';

  if (goal === 'cut') {
    if (absDiff < 0.2) {
      suggestion = currentCalories - 100;
      message = 'Weight barely moved over the last 2 weeks.';
      reason = 'Reduce by 100 kcal to maintain your deficit.';
      severity = 'warning';
    } else if (weekDiff < -1) {
      suggestion = currentCalories + 100;
      message = `Losing too fast (${weekDiff.toFixed(1)} kg / 2 weeks).`;
      reason = 'Increase by 100 kcal to protect muscle mass.';
      severity = 'warning';
    } else if (weekDiff > 0.3) {
      suggestion = currentCalories - 150;
      message = `Weight went up (+${absDiff.toFixed(1)} kg) over 2 weeks.`;
      reason = 'Reduce by 150 kcal to get back on track.';
      severity = 'warning';
    }
  } else if (goal === 'bulk') {
    if (weekDiff < 0.1) {
      suggestion = currentCalories + 100;
      message = 'Weight isn\'t increasing over the last 2 weeks.';
      reason = 'Increase by 100 kcal to support muscle growth.';
      severity = 'info';
    } else if (weekDiff > 0.6) {
      suggestion = currentCalories - 100;
      message = `Gaining too fast (+${absDiff.toFixed(1)} kg / 2 weeks).`;
      reason = 'Reduce by 100 kcal to limit fat gain.';
      severity = 'warning';
    }
  } else if (goal === 'maintain') {
    if (absDiff > 0.5) {
      const dir = weekDiff > 0 ? -1 : 1;
      suggestion = currentCalories + dir * 100;
      message = `Weight ${weekDiff > 0 ? 'increased' : 'decreased'} by ${absDiff.toFixed(1)} kg over 2 weeks.`;
      reason = `${dir > 0 ? 'Increase' : 'Reduce'} by 100 kcal to stabilize.`;
      severity = 'info';
    }
  }

  if (suggestion === null) return null;

  const newMacros = calculateMacros(suggestion, goal);

  const handleAccept = async () => {
    if (!user || suggestion === null) return;
    setSaving(true);
    await updateProfile(user.id, {
      daily_calorie_target: suggestion,
      protein_target: newMacros.protein,
      carbs_target: newMacros.carbs,
      fat_target: newMacros.fat,
    });
    toast('Calorie target updated');
    setSaving(false);
    onDismiss();
  };

  return (
    <div className={`mb-4 rounded-2xl border p-4 animate-fade-in-scale
      ${severity === 'warning' ? 'bg-amber-500/8 border-amber-500/30' : 'bg-blue-500/8 border-blue-500/30'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${severity === 'warning' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>
          {weekDiff > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{message}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{reason}</p>
          <p className="text-xs text-neutral-500 mt-1">
            Suggestion: <span className="font-medium text-white">{suggestion} kcal</span>
            {' '}(P:{newMacros.protein}g · C:{newMacros.carbs}g · F:{newMacros.fat}g)
          </p>
          <div className="flex items-center gap-1 mt-1.5">
            <Info size={10} className="text-neutral-600 shrink-0" />
            <p className="text-[10px] text-neutral-600">
              Based on {totalWeighIns} weigh-ins over the last {WINDOW_DAYS * 2} days
              {' '}· avg {avgCurrent.toFixed(1)} kg now vs {avgPrev.toFixed(1)} kg before
            </p>
          </div>
        </div>
        <button onClick={onDismiss} className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors shrink-0">
          <X size={14} />
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        <Button variant="secondary" onClick={onDismiss} size="sm" className="flex-1">Ignore</Button>
        <Button onClick={handleAccept} loading={saving} size="sm" className="flex-1">
          <Check size={14} /> Apply
        </Button>
      </div>
    </div>
  );
}
