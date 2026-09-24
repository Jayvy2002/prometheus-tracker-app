import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import ExerciseProgressPage from '../workout/ExerciseProgressPage';
import StatsPage from '../stats/StatsPage';
import CalendarPage from '../calendar/CalendarPage';
import HubTabs from './HubTabs';
import { useResourcePermissions } from '../../lib/useResourcePermissions';

type View = 'exercises' | 'trends' | 'calendar';

/** Suivi : Calendrier (page principale, Vision §13) · Exercices · Tendances. */
export default function SuiviHub() {
  const { t } = useTranslation();
  const { canReadOwnHistory, canOpenPersonalCalendarRoute } = useResourcePermissions();
  const [params, setParams] = useSearchParams();
  const views: View[] = [
    ...(canOpenPersonalCalendarRoute ? ['calendar' as const] : []),
    'exercises',
    ...(canReadOwnHistory ? ['trends' as const] : []),
  ];
  const requested = params.get('view') as View | null;
  const view = requested && views.includes(requested) ? requested : views[0];
  const labels: Record<View, string> = {
    exercises: t('nav.progressTraining'),
    trends: t('nav.progressSummary'),
    calendar: t('nav.calendar'),
  };

  return (
    <div>
      <HubTabs label={t('nav.suivi')} views={views} value={view} labels={labels} onChange={next => setParams({ view: next })} />
      <div className="px-4 pt-3">
        <Link to="/watch" className="inline-flex min-h-11 items-center gap-2 text-sm text-neutral-300 hover:text-white">
          <Eye size={16} className="text-blue-300" /> {t('prometheusWatch.title')}
        </Link>
      </div>
      {view === 'exercises' ? <ExerciseProgressPage embedded /> : null}
      {view === 'trends' ? <StatsPage embedded /> : null}
      {view === 'calendar' ? <CalendarPage /> : null}
    </div>
  );
}
