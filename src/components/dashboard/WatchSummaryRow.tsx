import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { listAthleteSignalsForWatch } from '../../features/signals/domain/athleteSignalsApi';
import { useResourcePermissions } from '../../lib/useResourcePermissions';
import ListRow from '../ui/ListRow';

/**
 * One line on Today instead of the whole Watch panel: it appears only when
 * Prometheus has open observations, and opens /watch for the detail.
 * A load failure hides the line; the full page still reports it.
 */
export default function WatchSummaryRow({ athleteId }: { athleteId: string | undefined }) {
  const { t } = useTranslation();
  const { canReadAthleteWatch } = useResourcePermissions();
  const allowed = !!athleteId && canReadAthleteWatch({ athleteId });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!allowed || !athleteId) return;
    let cancelled = false;
    void listAthleteSignalsForWatch(athleteId)
      .then(result => { if (!cancelled) setCount(result.ok ? result.data.length : 0); })
      .catch(() => { if (!cancelled) setCount(0); });
    return () => { cancelled = true; };
  }, [allowed, athleteId]);

  if (!allowed || count === 0) return null;
  return (
    <ListRow
      className="mb-4"
      icon={<Eye size={16} />}
      title={t('prometheusWatch.summary', { count })}
      subtitle={t('prometheusWatch.summaryHint')}
      to="/watch"
    />
  );
}
