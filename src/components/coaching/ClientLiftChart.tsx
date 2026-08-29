import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClientLiftProgress } from '../../lib/types';
import { liftChartPoints } from '../../lib/coachProgress';
import {
  hasRecentPr,
  liftChartKind,
  loggedExerciseOptions,
  pickDefaultLift,
  recentLoggedLifts,
} from '../../lib/coachTraining';
import { formatDate, todayStr } from '../../lib/utils';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { LiftLineChart } from './ProgressCharts';

export default function ClientLiftChart({
  lifts,
  selectedName,
  notes,
  prescribedNames,
  relanceHref,
  showRelance,
  compact,
  onSelect,
  onOpenSeries,
}: {
  lifts: ClientLiftProgress[];
  selectedName?: string;
  notes?: Array<{ body: string }>;
  prescribedNames?: string[];
  relanceHref?: string | null;
  showRelance?: boolean;
  compact?: boolean;
  onSelect: (name: string) => void;
  onOpenSeries?: (lift: ClientLiftProgress) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const today = todayStr();
  const [localHint, setLocalHint] = useState(selectedName ?? '');
  useEffect(() => {
    setLocalHint(selectedName ?? '');
  }, [selectedName]);
  const recent = useMemo(() => recentLoggedLifts(lifts, today), [lifts, today]);
  const selected = useMemo(
    () => pickDefaultLift(lifts, { hint: localHint || selectedName, notes, prescribedNames, today }),
    [lifts, localHint, selectedName, notes, prescribedNames, today],
  );
  const options = useMemo(() => {
    if (selected && !recent.some(l => l.exerciseName === selected.exerciseName)) {
      return loggedExerciseOptions([...recent, selected]);
    }
    return loggedExerciseOptions(recent);
  }, [recent, selected]);
  const kind = liftChartKind(selected);
  const points = selected ? liftChartPoints(selected) : [];
  const last = selected?.sessions[0];

  if (kind === 'empty' || !selected) {
    return (
      <Card className="space-y-3">
        <p className="text-[11px] uppercase tracking-wider text-neutral-500">
          {t('coaching.trainingLift.title')}
        </p>
        <p className="text-sm text-neutral-300">{t('coaching.trainingLift.emptyBody')}</p>
        {relanceHref ? (
          <Button size="sm" onClick={() => navigate(relanceHref)}>
            {t('coaching.queue.relance')}
          </Button>
        ) : null}
      </Card>
    );
  }

  return (
    <Card
      className="space-y-3"
      onClick={compact ? () => onSelect(selected.displayName) : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-neutral-500">
            {t('coaching.trainingLift.title')}
          </p>
          {compact ? (
            <p className="text-sm font-medium text-white truncate mt-0.5">{selected.displayName}</p>
          ) : (
            <label className="block mt-1">
              <span className="sr-only">{t('coaching.trainingLift.picker')}</span>
              <select
                value={selected.displayName}
                onChange={e => {
                  setLocalHint(e.target.value);
                  onSelect(e.target.value);
                }}
                className="mt-0.5 w-full max-w-xs bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-sm text-white"
              >
                {options.map(l => (
                  <option key={l.exerciseName} value={l.displayName}>{l.displayName}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {hasRecentPr(selected) && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 shrink-0">
            {t('coaching.trainingLift.pr')}
          </span>
        )}
      </div>

      <p className="text-xs text-neutral-400">
        {t('coaching.trainingLift.last', {
          set: last?.bestSet ?? '—',
          date: last?.date ? formatDate(last.date) : '—',
        })}
        {' · '}
        {t('coaching.trainingLift.sessions', { n: selected.sessions.length })}
      </p>
      <p className="text-[11px] text-neutral-600">{t('coaching.trainingLift.topSet')}</p>

      {kind === 'curve' ? (
        <LiftLineChart points={points} />
      ) : (
        <p className="text-sm text-neutral-400">
          {t('coaching.trainingLift.singlePoint', { set: last?.bestSet ?? '—' })}
        </p>
      )}

      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          {onOpenSeries && (
            <Button size="sm" variant="secondary" onClick={() => onOpenSeries(selected)}>
              {t('coaching.trainingLift.openSeries')}
            </Button>
          )}
          {showRelance && relanceHref && (
            <Button size="sm" variant="ghost" onClick={() => navigate(relanceHref)}>
              {t('coaching.queue.relance')}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
