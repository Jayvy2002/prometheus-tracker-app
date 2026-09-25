import { useTranslation } from 'react-i18next';
import type { LastSessionView, LiftSetSnapshot } from '../../lib/types';
import { readableSets } from '../../lib/coachLastSession';
import { optionLabel } from '../../lib/optionLabels';
import Card from '../ui/Card';
import { formatLoad } from '../../lib/utils';
import { useProfileStore } from '../../stores/profileStore';
import { namedSetType } from '../../features/workout/domain/timedExercise';
import { useExerciseDisplayName } from '../../features/workout/hooks/useExerciseDisplayName';

function setLabel(set: LiftSetSnapshot, typeLabel: (value: string) => string, unit: 'kg' | 'lbs'): string {
  const load = set.set_type === 'isometric'
    ? `${formatLoad(set.weight_kg, unit)} × ${set.duration_seconds ?? 0}s`
    : `${formatLoad(set.weight_kg, unit)} × ${set.reps}`;
  const rir = set.rir > 0 ? ` @ RIR ${set.rir}` : '';
  // Working set → nothing; unknown legacy value (« normal »…) → nothing, never the raw key.
  const named = namedSetType(set.set_type);
  const kind = named ? ` · ${typeLabel(named)}` : '';
  return `${load}${rir}${kind}`;
}

export default function SessionReadout({
  session,
  onExercise,
}: {
  session: LastSessionView;
  onExercise?: (name: string) => void;
}) {
  const { t } = useTranslation();
  const exerciseName = useExerciseDisplayName();
  const typeLabel = (value: string) => optionLabel(t, 'setTypes', value);
  const unit = useProfileStore(s => s.profile?.unit_weight === 'lbs' ? 'lbs' : 'kg');
  return (
    <div className="space-y-2">
      {session.exercises.map((ex, idx) => {
        const sets = readableSets(ex.sets);
        return (
          <Card
            key={`${ex.name}-${idx}`}
            padding={false}
            className="p-3"
            onClick={onExercise ? () => onExercise(ex.name) : undefined}
          >
            <p className="text-sm font-medium text-white mb-1">{exerciseName(ex.name)}</p>
            {ex.notes?.trim() ? (
              <p className="text-xs text-neutral-500 mb-1" data-session-notes="true">{ex.notes.trim()}</p>
            ) : null}
            {sets.length === 0 ? (
              <p className="text-xs text-neutral-600">—</p>
            ) : sets.map((s, i) => (
              <p key={`${ex.name}-${i}`} className="text-xs text-neutral-400 tabular-nums">
                {i + 1}. {setLabel(s, typeLabel, unit)}
              </p>
            ))}
          </Card>
        );
      })}
    </div>
  );
}
