import { useTranslation } from 'react-i18next';
import type { LastSessionView, LiftSetSnapshot } from '../../lib/types';
import { readableSets } from '../../lib/coachLastSession';
import { optionLabel } from '../../lib/optionLabels';
import Card from '../ui/Card';

function setLabel(set: LiftSetSnapshot, typeLabel: (value: string) => string): string {
  const load = set.set_type === 'isometric'
    ? `${set.weight_kg}kg × ${set.duration_seconds ?? 0}s`
    : `${set.weight_kg}kg × ${set.reps}`;
  const rir = set.rir > 0 ? ` @ RIR ${set.rir}` : '';
  const kind = set.set_type && set.set_type !== 'working' ? ` · ${typeLabel(set.set_type)}` : '';
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
  const typeLabel = (value: string) => optionLabel(t, 'setTypes', value);
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
            <p className="text-sm font-medium text-white mb-1">{ex.name}</p>
            {ex.notes?.trim() ? (
              <p className="text-xs text-neutral-500 mb-1" data-session-notes="true">{ex.notes.trim()}</p>
            ) : null}
            {sets.length === 0 ? (
              <p className="text-xs text-neutral-600">—</p>
            ) : sets.map((s, i) => (
              <p key={`${ex.name}-${i}`} className="text-xs text-neutral-400 tabular-nums">
                {i + 1}. {setLabel(s, typeLabel)}
              </p>
            ))}
          </Card>
        );
      })}
    </div>
  );
}
