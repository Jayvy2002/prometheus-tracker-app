import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import HubTabs, { HubLoading } from './HubTabs';
import { useResourcePermissions } from '../../lib/useResourcePermissions';
import { hubRedirectPath, suiviHubItems, suiviWatchItem } from '../../app/navigation/navConfig';

/**
 * Suivi : Calendrier (page principale, Vision §13) · Exercices · Résumé, with
 * « Ce que Prometheus surveille » beside the tabs. Calendar and summary are
 * personal read surfaces: shown only to who may open them.
 */
function useSuiviHubItems() {
  const { actor, canReadOwnHistory, canOpenPersonalCalendarRoute } = useResourcePermissions();
  return {
    ready: actor.ready,
    items: suiviHubItems({ calendar: canOpenPersonalCalendarRoute, history: canReadOwnHistory }),
  };
}

/**
 * Layout of every Suivi page (/calendar, /exercise-progress, /stats, /watch):
 * the page (CalendarPage, ExerciseProgressPage, StatsPage…) keeps its own
 * route and guards, and always shows the same sub-tabs.
 */
export default function SuiviHub() {
  const { t } = useTranslation();
  const { ready, items } = useSuiviHubItems();
  return (
    <div>
      {ready ? <HubTabs label={t('nav.suivi')} items={items} extra={suiviWatchItem} /> : null}
      <Outlet />
    </div>
  );
}

/** `/suivi` (the Suivi tab, and old `/suivi?view=` links) opens the first available sub-page. */
export function SuiviHubIndex() {
  const [params] = useSearchParams();
  const { ready, items } = useSuiviHubItems();
  if (!ready) return <HubLoading />;
  const target = hubRedirectPath(items, params.get('view')) ?? '/exercise-progress';
  return <Navigate to={target} replace />;
}
