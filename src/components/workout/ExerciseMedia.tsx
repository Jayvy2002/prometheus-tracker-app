import { useTranslation } from 'react-i18next';
import type { Exercise } from '../../lib/types';
import { exerciseVideoKind, youtubeEmbedUrl } from '../../lib/exerciseVideo';
import { muscleLabel } from '../../lib/muscleLabels';
import ExerciseMuscleMannequin from './ExerciseMuscleMannequin';

interface Props {
  exercise: Pick<Exercise, 'video_url' | 'primary_muscles' | 'secondary_muscles' | 'name' | 'name_fr'>;
  compact?: boolean;
}

export default function ExerciseMedia({ exercise, compact = false }: Props) {
  const { t, i18n } = useTranslation();
  const kind = exerciseVideoKind(exercise.video_url);
  const embed = youtubeEmbedUrl(exercise.video_url);
  const height = compact ? 'h-40' : 'h-52';

  return (
    <div className="space-y-3" data-exercise-media="true">
      {kind === 'youtube' && embed && (
        <div className={`overflow-hidden rounded-xl border border-neutral-800 bg-black ${height}`}>
          <iframe
            title={t('workout.exercisePicker.videoTitle', { name: exercise.name })}
            src={embed}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
      {kind === 'file' && exercise.video_url && (
        <video
          className={`w-full ${height} rounded-xl border border-neutral-800 bg-black object-cover`}
          src={exercise.video_url}
          controls
          playsInline
        />
      )}
      {!kind && (
        <p className="text-xs text-neutral-500">{t('workout.exercisePicker.noVideo')}</p>
      )}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-neutral-500">
          {t('workout.exercisePicker.musclesWorked')}
        </p>
        <ExerciseMuscleMannequin
          primary={exercise.primary_muscles}
          secondary={exercise.secondary_muscles}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {exercise.primary_muscles.map(m => (
            <span key={`p-${m}`} className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-300">
              {muscleLabel(m, i18n.language)}
            </span>
          ))}
          {exercise.secondary_muscles.map(m => (
            <span key={`s-${m}`} className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-200/70">
              {muscleLabel(m, i18n.language)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
