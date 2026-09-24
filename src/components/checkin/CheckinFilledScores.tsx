import { useTranslation } from 'react-i18next';
import { formatCheckinScore } from '../../lib/checkinScale';
import { usedCheckinScores } from '../../lib/checkinHistory';
import type { DailyCheckin } from '../../lib/types';
import { formatNumber } from '../../lib/utils';
import type { CustomAnswer } from '../../features/checkins/domain/checkinTemplate';

/** A custom answer as it was given (the label of that day, never today's template). */
function answerText(answer: CustomAnswer, t: (key: string) => string): string {
  if (answer.display) return answer.display;
  if (typeof answer.value === 'boolean') return t(answer.value ? 'checkinPlan.yes' : 'checkinPlan.no');
  if (typeof answer.value === 'number') return formatNumber(answer.value);
  if (Array.isArray(answer.value)) return answer.value.join(', ');
  return answer.value ?? '';
}

export default function CheckinFilledScores({ row }: { row: DailyCheckin }) {
  const { t } = useTranslation();
  const scores = usedCheckinScores(row);
  const custom = row.custom_answers ?? [];
  if (row.sleep_hours == null && scores.length === 0 && custom.length === 0) {
    return <p className="text-[11px] text-neutral-500">{t('checkin.notSet')}</p>;
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-400" data-testid="checkin-filled-scores">
        {row.sleep_hours != null ? (
          <span>{t('checkin.sleepHours')}: {formatNumber(row.sleep_hours)}</span>
        ) : null}
        {scores.map(key => (
          <span key={key}>
            {t(`checkin.fields.${key}`)}: {formatCheckinScore(row[key], row)}
          </span>
        ))}
      </div>
      {custom.length > 0 && (
        <ul className="space-y-1 text-[11px] text-neutral-400" data-testid="checkin-custom-answers">
          {custom.map(answer => (
            <li key={answer.id}>
              <span className="text-neutral-500">{answer.label}</span> : {answerText(answer, t)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
