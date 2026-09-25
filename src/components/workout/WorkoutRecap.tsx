import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Clock, Pencil } from 'lucide-react';
import { formatDate, formatDuration, formatWeight } from '../../lib/utils';
import { useProfileStore } from '../../stores/profileStore';
import { optionLabel } from '../../lib/optionLabels';
import { isCompletedSet, isPerformedSet, isWarmupSet } from '../../lib/performedSets';
import { usePlanSessionLabel } from '../../features/programs/hooks/usePlanSessionLabel';
import { namedSetType } from '../../features/workout/domain/timedExercise';
import type { Workout } from '../../lib/types';
import ReminderPermissionPrompt from '../profile/ReminderPermissionPrompt';
import Button from '../ui/Button';
import Card from '../ui/Card';
import IconButton from '../ui/IconButton';
import { useExerciseDisplayName } from '../../features/workout/hooks/useExerciseDisplayName';

interface Props {
  workout: Workout;
  onEdit: () => void;
}

export default function WorkoutRecap({ workout, onEdit }: Props) {
  const { t, i18n } = useTranslation();
  const exerciseName = useExerciseDisplayName();
  const unit = useProfileStore(s => s.profile?.unit_weight) === 'lbs' ? 'lbs' : 'kg';
  const navigate = useNavigate();
  const sessionLabel = usePlanSessionLabel(workout.program_day_id, workout.name || t('workout.title'));

  return (
    <div className="px-4 pt-4 pb-8" data-testid="workout-recap">
      <div className="flex items-center gap-3 mb-4">
        <IconButton label={t('common.back')} onClick={() => navigate('/workout')} className="-ml-2">
          <ArrowLeft size={20} />
        </IconButton>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-white truncate" data-testid="ux22-session-label">{sessionLabel}</h1>
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

      <ReminderPermissionPrompt />

      <div className="space-y-3">
        {(workout.exercises ?? []).map(ex => {
          const logged = (ex.sets ?? []).filter(isPerformedSet).length;
          return (
            <Card key={ex.id} padding={false} className="p-3">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-white">{exerciseName(ex.name, ex.catalog_exercise_id)}</p>
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
                {(ex.sets ?? []).map((s, i) => {
                  const done = isCompletedSet(s);
                  const named = namedSetType(s.set_type);
                  return (
                    <p
                      key={s.id}
                      className={`text-xs tabular-nums ${done ? 'text-neutral-400' : 'text-neutral-600'}`}
                    >
                      {i + 1}. {formatWeight(s.weight_kg, unit)} × {s.set_type === 'isometric' ? `${s.duration_seconds ?? 0}s` : s.reps}
                      {s.rir ? ` · RIR ${s.rir}` : ''}
                      {named ? ` · ${optionLabel(t, 'setTypes', named)}` : ''}
                      {!done && !isWarmupSet(s) ? ` · ${t('workout.recap.skippedSet')}` : ''}
                    </p>
                  );
                })}
              </div>
              {ex.notes && <p className="text-xs text-neutral-500 mt-2">{ex.notes}</p>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
