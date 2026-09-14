import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Clock, Pencil } from 'lucide-react';
import { formatDate, formatDuration } from '../../lib/utils';
import { optionLabel } from '../../lib/optionLabels';
import type { Workout } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';

interface Props {
  workout: Workout;
  onEdit: () => void;
}

export default function WorkoutRecap({ workout, onEdit }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/workout')} className="p-2 -ml-2 text-neutral-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-white truncate">{workout.name || t('workout.title')}</h1>
          <p className="text-xs text-neutral-500">{formatDate(workout.date, i18n.language)}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onEdit}>
          <Pencil size={14} /> {t('common.edit')}
        </Button>
      </div>

      {workout.duration_seconds > 0 && (
        <div className="flex items-center gap-2 text-sm text-neutral-400 mb-4">
          <Clock size={14} /> {formatDuration(workout.duration_seconds)}
        </div>
      )}

      <div className="space-y-3">
        {(workout.exercises ?? []).map(ex => {
          const logged = (ex.sets ?? []).filter(s => s.set_type !== 'warmup' && (s.weight_kg > 0 || s.reps > 0)).length;
          return (
            <Card key={ex.id} padding={false} className="p-3">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-white">{ex.name}</p>
                {ex.prescribed_sets ? (
                  <p className="text-[11px] text-neutral-500">
                    {t('workout.prescribedVsLogged', {
                      prescribed: `${ex.prescribed_sets}×${ex.prescribed_reps ?? ''}`,
                      logged,
                    })}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                {(ex.sets ?? []).map((s, i) => (
                  <p key={s.id} className="text-xs text-neutral-400 tabular-nums">
                    {i + 1}. {s.weight_kg} kg × {s.set_type === 'isometric' ? `${s.duration_seconds ?? 0}s` : s.reps}
                    {s.rir ? ` · RIR ${s.rir}` : ''}
                    {s.set_type && s.set_type !== 'working' ? ` · ${optionLabel(t, 'setTypes', s.set_type)}` : ''}
                  </p>
                ))}
              </div>
              {ex.notes && <p className="text-xs text-neutral-500 mt-2">{ex.notes}</p>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
