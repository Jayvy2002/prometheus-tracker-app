import { Link2Off, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WorkoutExercise } from '../../lib/types';
import { useWorkoutStore } from '../../stores/workoutStore';
import ExerciseCard from './ExerciseCard';

interface Props {
  exercises: WorkoutExercise[];
  onStartRestTimer: (overrideDuration?: number) => void;
}

export default function SupersetGroup({ exercises, onStartRestTimer }: Props) {
  const { t } = useTranslation();
  const { unlinkSuperset } = useWorkoutStore();

  const handleUnlink = (exerciseId: string) => {
    unlinkSuperset(exerciseId);
  };

  return (
    <div className="relative">
      {/* Group label */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className="flex items-center gap-1.5 text-green-400">
          <Zap size={12} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Superset</span>
        </div>
        <div className="flex-1 h-px bg-green-500/20" />
        <button
          onClick={() => exercises.forEach(e => handleUnlink(e.id))}
          className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <Link2Off size={10} />
          {t('common.remove')}
        </button>
      </div>

      {/* Connected exercises */}
      <div className="relative pl-3">
        {/* Green left connector line */}
        <div className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full bg-gradient-to-b from-green-500/60 via-green-400/40 to-green-500/60" />

        <div className="space-y-2">
          {exercises.map((ex, i) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              onStartRestTimer={onStartRestTimer}
              isInSuperset
              restAfterComplete={i === exercises.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
