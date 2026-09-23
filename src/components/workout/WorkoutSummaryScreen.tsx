import { CheckCircle, Zap, Dumbbell, Clock, BarChart2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDuration, formatWeight } from '../../lib/utils';
import { useProfileStore } from '../../stores/profileStore';
import type { Workout } from '../../lib/types';
import { computeWorkoutSummaryStats } from '../../lib/performedSets';
import { isCoachedAthlete } from '../../lib/coachRole';
import { useCoachingStore } from '../../stores/coachingStore';
import Button from '../ui/Button';

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
  const { t } = useTranslation();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const showCoachSaw = isCoachedAthlete(coachingRole, myCoach);
  const stats = computeWorkoutSummaryStats(workout, duration);
  const unit = useProfileStore(s => s.profile?.unit_weight) === 'lbs' ? 'lbs' : 'kg';
  const volumeLabel = formatWeight(stats.totalVolume, unit);

  const fact = stats.setCount === 0
    ? t('workout.summary.facts.nonePerformed')
    : stats.skippedSetCount > 0
      ? t('workout.summary.facts.skipped', { count: stats.skippedSetCount })
      : null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col overflow-y-auto">
      <div className="flex-1 px-5 pt-10 pb-8 flex flex-col">
        <div className="text-center mb-8 animate-fade-in-scale">
          <div className="relative w-24 h-24 mx-auto mb-5">
            <div className="absolute inset-0 rounded-full bg-blue-600/20 animate-pulse" />
            <div className="absolute inset-2 rounded-full bg-blue-600/30 flex items-center justify-center">
              <CheckCircle size={36} className="text-blue-400" strokeWidth={1.5} />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">{t('workout.summary.title')}</h1>
          {workout.name ? (
            <p className="text-neutral-400 text-sm">{workout.name}</p>
          ) : (
            <p className="text-neutral-500 text-sm">{t('workout.summary.subtitle')}</p>
          )}
          {showCoachSaw ? (
            <p className="text-sm text-blue-300/90 mt-2">{t('workout.summary.coachWillSee')}</p>
          ) : null}
        </div>

        <div
          className="grid grid-cols-2 gap-3 mb-6 animate-fade-in-up"
          style={{ animationDelay: '80ms' }}
        >
          <StatCard
            icon={Clock}
            label={t('workout.summary.duration')}
            value={formatDuration(duration)}
            colorClass="bg-blue-500/15 text-blue-400"
          />
          <StatCard
            icon={BarChart2}
            label={t('workout.summary.totalVolume')}
            value={volumeLabel}
            colorClass="bg-emerald-500/15 text-emerald-400"
          />
          <StatCard
            icon={Dumbbell}
            label={t('workout.summary.exercises')}
            value={String(stats.exerciseCount)}
            colorClass="bg-neutral-800 text-neutral-300"
          />
          <StatCard
            icon={Zap}
            label={t('workout.summary.setsDone')}
            value={String(stats.setCount)}
            colorClass="bg-blue-500/15 text-blue-400"
          />
        </div>

        {fact ? (
          <p
            role="status"
            className="text-sm text-neutral-400 mb-6 px-0.5 animate-fade-in-up"
            style={{ animationDelay: '120ms' }}
          >
            {fact}
          </p>
        ) : null}

        {stats.topExercises.length > 0 && (
          <div
            className="mb-6 animate-fade-in-up"
            style={{ animationDelay: '160ms' }}
          >
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 px-0.5">
              {t('workout.summary.topLifts')}
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
                        {formatWeight(ex.volume, unit)}{' '}
                        {t('workout.summary.vol')}
                      </p>
                    )}
                    {ex.estimated1RM > 0 && (
                      <p className="text-xs text-blue-400 font-medium">
                        ~{formatWeight(ex.estimated1RM, unit)} {t('workout.summary.oneRM')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1" />

        <Button
          type="button"
          size="lg"
          onClick={onClose}
          className="w-full"
        >
          {t('workout.summary.seeSession')}
        </Button>
      </div>
    </div>
  );
}
