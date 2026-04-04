import { useEffect, useRef } from 'react';
import { CheckCircle, Zap, Dumbbell, Clock, BarChart2 } from 'lucide-react';
import { formatDuration } from '../../lib/utils';
import type { Workout } from '../../lib/types';

interface SummaryStats {
  duration: number;
  totalVolume: number;
  exerciseCount: number;
  setCount: number;
  topExercises: { name: string; volume: number; estimated1RM: number }[];
}

function computeStats(workout: Workout, duration: number): SummaryStats {
  let totalVolume = 0;
  let setCount = 0;
  const exerciseStats: { name: string; volume: number; estimated1RM: number }[] = [];

  for (const ex of workout.exercises ?? []) {
    let exVolume = 0;
    let max1RM = 0;
    for (const s of ex.sets ?? []) {
      if (s.set_type === 'warmup') continue;
      const vol = (s.weight_kg ?? 0) * (s.reps ?? 0);
      exVolume += vol;
      totalVolume += vol;
      setCount++;
      if ((s.reps ?? 0) > 0 && (s.weight_kg ?? 0) > 0) {
        const rm = s.weight_kg * (1 + s.reps / 30);
        if (rm > max1RM) max1RM = rm;
      }
    }
    if (exVolume > 0 || (ex.sets?.length ?? 0) > 0) {
      exerciseStats.push({ name: ex.name, volume: exVolume, estimated1RM: max1RM });
    }
  }

  exerciseStats.sort((a, b) => b.volume - a.volume);

  return {
    duration,
    totalVolume,
    exerciseCount: workout.exercises?.length ?? 0,
    setCount,
    topExercises: exerciseStats.slice(0, 3),
  };
}

function StatCard({
  icon: Icon,
  label,
  value,
  colorClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  colorClass: string;
}) {
  return (
    <div className="bg-neutral-900/70 border border-neutral-800/50 rounded-2xl p-4">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2.5 ${colorClass}`}>
        <Icon size={15} />
      </div>
      <p className="text-lg font-bold text-white leading-tight">{value}</p>
      <p className="text-xs text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function WorkoutSummaryScreen({
  workout,
  duration,
  onClose,
}: {
  workout: Workout;
  duration: number;
  onClose: () => void;
}) {
  const stats = computeStats(workout, duration);
  const closedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!closedRef.current) onClose();
    }, 30000);
    return () => clearTimeout(t);
  }, [onClose]);

  const handleClose = () => {
    closedRef.current = true;
    onClose();
  };

  const volumeLabel =
    stats.totalVolume >= 1000
      ? `${(stats.totalVolume / 1000).toFixed(1)}t`
      : `${Math.round(stats.totalVolume)} kg`;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col overflow-y-auto">
      <div className="flex-1 px-5 pt-10 pb-8 flex flex-col">
        {/* Hero */}
        <div className="text-center mb-8 animate-fade-in-scale">
          <div className="relative w-24 h-24 mx-auto mb-5">
            <div className="absolute inset-0 rounded-full bg-blue-600/20 animate-pulse" />
            <div className="absolute inset-2 rounded-full bg-blue-600/30 flex items-center justify-center">
              <CheckCircle size={36} className="text-blue-400" strokeWidth={1.5} />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">Workout Complete!</h1>
          {workout.name ? (
            <p className="text-neutral-400 text-sm">{workout.name}</p>
          ) : (
            <p className="text-neutral-500 text-sm">Great session 💪</p>
          )}
        </div>

        {/* Stats grid */}
        <div
          className="grid grid-cols-2 gap-3 mb-6 animate-fade-in-up"
          style={{ animationDelay: '80ms' }}
        >
          <StatCard
            icon={Clock}
            label="Duration"
            value={formatDuration(duration)}
            colorClass="bg-blue-500/15 text-blue-400"
          />
          <StatCard
            icon={BarChart2}
            label="Total Volume"
            value={volumeLabel}
            colorClass="bg-emerald-500/15 text-emerald-400"
          />
          <StatCard
            icon={Dumbbell}
            label="Exercises"
            value={String(stats.exerciseCount)}
            colorClass="bg-orange-500/15 text-orange-400"
          />
          <StatCard
            icon={Zap}
            label="Sets Done"
            value={String(stats.setCount)}
            colorClass="bg-violet-500/15 text-violet-400"
          />
        </div>

        {/* Top lifts */}
        {stats.topExercises.length > 0 && (
          <div
            className="mb-6 animate-fade-in-up"
            style={{ animationDelay: '160ms' }}
          >
            <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2 px-0.5">
              Top Lifts
            </p>
            <div className="space-y-2">
              {stats.topExercises.map((ex, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-neutral-900/60 border border-neutral-800/40 rounded-xl px-4 py-3"
                >
                  <span className="text-sm text-white font-medium truncate flex-1 mr-3">
                    {ex.name}
                  </span>
                  <div className="text-right shrink-0">
                    {ex.volume > 0 && (
                      <p className="text-xs text-neutral-400">
                        {ex.volume >= 1000
                          ? `${(ex.volume / 1000).toFixed(1)}t`
                          : `${Math.round(ex.volume)} kg`}{' '}
                        vol
                      </p>
                    )}
                    {ex.estimated1RM > 0 && (
                      <p className="text-[11px] text-blue-400 font-medium">
                        ~{Math.round(ex.estimated1RM)} kg 1RM
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1" />

        {/* CTA */}
        <button
          onClick={handleClose}
          className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base transition-colors animate-fade-in-up shadow-lg shadow-blue-900/30"
          style={{ animationDelay: '240ms' }}
        >
          Back to Workouts
        </button>
      </div>
    </div>
  );
}
