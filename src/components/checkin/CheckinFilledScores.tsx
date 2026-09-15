import { useTranslation } from 'react-i18next';
import { formatCheckinScore } from '../../lib/checkinScale';
import { usedCheckinScores } from '../../lib/checkinHistory';
import type { DailyCheckin } from '../../lib/types';

export default function CheckinFilledScores({ row }: { row: DailyCheckin }) {
  const { t } = useTranslation();
  const scores = usedCheckinScores(row);
  if (row.sleep_hours == null && scores.length === 0) {
    return <p className="text-[11px] text-neutral-500">{t('checkin.notSet')}</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-400" data-testid="checkin-filled-scores">
      {row.sleep_hours != null ? (
        <span>{t('checkin.sleepHours')}: {row.sleep_hours}</span>
      ) : null}
      {scores.map(key => (
        <span key={key}>
          {t(`checkin.fields.${key}`)}: {formatCheckinScore(row[key], row)}
        </span>
      ))}
    </div>
  );
}
