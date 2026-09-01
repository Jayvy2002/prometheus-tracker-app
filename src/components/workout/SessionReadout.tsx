import { useTranslation } from 'react-i18next';
import type { LastSessionView, LiftSetSnapshot } from '../../lib/types';
import { prescribedVsPerformed, readableSets } from '../../lib/coachLastSession';
import Card from '../ui/Card';

function setLabel(set: LiftSetSnapshot): string {
  const load = set.set_type === 'isometric'
    ? `${set.weight_kg}kg × ${set.duration_seconds ?? 0}s`
    : `${set.weight_kg}kg × ${set.reps}`;
  const rir = set.rir > 0 ? ` @ RIR ${set.rir}` : '';
  const kind = set.set_type && set.set_type !== 'working' ? ` · ${set.set_type}` : '';
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
  return (
    <div className="space-y-2">
      {session.exercises.map((ex, idx) => {
        const sets = readableSets(ex.sets);
        const gap = prescribedVsPerformed(ex);
        return (
          <Card
            key={`${ex.name}-${idx}`}
            padding={false}
            className="p-3"
            onClick={onExercise ? () => onExercise(ex.name) : undefined}
          >
            <p className="text-sm font-medium text-white mb-1">{ex.name}</p>
            {gap && (
              <p className={`text-[11px] mb-1 tabular-nums ${gap.onTarget ? 'text-neutral-500' : 'text-amber-400'}`}>
                {t('coaching.lastSession.prescribedVsPerformed', {
                  prescribed: gap.prescribed,
                  performed: gap.performed,
                })}
              </p>
            )}
            {sets.length === 0 ? (
              <p className="text-xs text-neutral-600">—</p>
            ) : sets.map((s, i) => (
              <p key={`${ex.name}-${i}`} className="text-xs text-neutral-400 tabular-nums">
                {i + 1}. {setLabel(s)}
              </p>
            ))}
          </Card>
        );
      })}
    </div>
  );
}
