import { useTranslation } from 'react-i18next';
import { previousCheckins } from '../../lib/checkinHistory';
import type { DailyCheckin } from '../../lib/types';
import Card from '../ui/Card';
import CheckinFilledScores from './CheckinFilledScores';

export default function CheckinHistoryList({
  checkins,
  today,
}: {
  checkins: DailyCheckin[];
  today: string;
}) {
  const { t, i18n } = useTranslation();
  const rows = previousCheckins(checkins, today);

  return (
    <div className="mt-8">
      <h2 className="text-sm font-medium text-white mb-3">{t('checkin.historyTitle')}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">{t('checkin.historyEmpty')}</p>
      ) : (
        <div className="space-y-2">
          {rows.map(row => {
            const label = new Date(`${row.checked_at}T12:00:00`).toLocaleDateString(i18n.language, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            });
            return (
              <Card key={row.id}>
                <p className="text-sm font-medium text-white mb-2">{label}</p>
                <CheckinFilledScores row={row} />
                {row.notes ? (
                  <p className="text-xs text-neutral-500 mt-2">{row.notes}</p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
