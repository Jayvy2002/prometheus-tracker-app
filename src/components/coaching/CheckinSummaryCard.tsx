import { useTranslation } from 'react-i18next';
import Card from '../ui/Card';
import type { CheckinSummary } from '../../lib/types';

function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value == null) return <span className="text-neutral-600">—</span>;
  const upIsGood = !invert;
  const good = upIsGood ? value > 0 : value < 0;
  const bad = upIsGood ? value < 0 : value > 0;
  const cls = good ? 'text-emerald-400' : bad ? 'text-rose-400' : 'text-neutral-400';
  const sign = value > 0 ? '+' : '';
  return <span className={cls}>{sign}{value}</span>;
}

function StatusPill({ status }: { status: CheckinSummary['globalStatus'] }) {
  const { t } = useTranslation();
  const cls = status === 'concern' ? 'bg-rose-500/15 text-rose-300'
    : status === 'watch' ? 'bg-amber-500/15 text-amber-300'
    : status === 'good' ? 'bg-emerald-500/15 text-emerald-300'
    : 'bg-neutral-800 text-neutral-400';
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>
      {t(`coaching.checkin.status.${status}`)}
    </span>
  );
}

export default function CheckinSummaryCard({
  summary,
  onSeeAnswers,
  hideSeeAnswers,
}: {
  summary: CheckinSummary;
  onSeeAnswers?: () => void;
  hideSeeAnswers?: boolean;
}) {
  const { t } = useTranslation();
  if (!summary.latest) {
    return (
      <Card>
        <p className="text-sm text-neutral-400">{t('coaching.empty.checkins')}</p>
      </Card>
    );
  }

  const rows: Array<{ key: string; value: number | null; delta: number | null; invert?: boolean }> = [
    { key: 'training', value: summary.training, delta: summary.deltas.training },
    { key: 'recovery', value: summary.recovery, delta: summary.deltas.recovery },
    { key: 'nutrition', value: summary.nutrition, delta: summary.deltas.nutrition },
    { key: 'motivation', value: summary.motivation, delta: summary.deltas.motivation },
    { key: 'pain', value: summary.pain, delta: summary.deltas.pain, invert: true },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-white">{t('coaching.checkin.summaryTitle')}</p>
        <StatusPill status={summary.globalStatus} />
      </div>
      <p className="text-[11px] text-neutral-500 mb-3">{summary.latest.checked_at}</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        {rows.map(row => (
          <div key={row.key} className="rounded-xl bg-neutral-950/60 px-2 py-2">
            <p className="text-[10px] text-neutral-500 uppercase tracking-wide">
              {t(`coaching.checkin.kpis.${row.key}`)}
            </p>
            <p className="text-sm text-white mt-0.5">{row.value ?? '—'}</p>
            <p className="text-[11px]"><Delta value={row.delta} invert={row.invert} /></p>
          </div>
        ))}
      </div>
      {!hideSeeAnswers && onSeeAnswers ? (
        <button type="button" onClick={onSeeAnswers} className="text-xs text-blue-400 hover:text-blue-300">
          {t('coaching.checkin.seeAnswers')}
        </button>
      ) : null}
    </Card>
  );
}
