import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import HubTabs, { HubLoading } from './HubTabs';
import { useClientTracking } from '../../lib/useClientTracking';
import { useCoachingStore } from '../../stores/coachingStore';
import { isCoachedAthlete } from '../../lib/coachRole';
import { checkinHasAnyField } from '../../lib/clientTracking';
import { bodyHubItems, hubRedirectPath } from '../../app/navigation/navConfig';

/**
 * Corps : what is logged about oneself. Only active modules appear: a module
 * switched off by the coach is not an empty view, it does not exist. Photos
 * (private by default) are always there; measurements follow the weight module
 * (Vision §14.4). The same list feeds the desktop « Corps » section.
 */
function useBodyHubItems() {
  const tracking = useClientTracking();
  const coached = useCoachingStore(s => isCoachedAthlete(s.coachingRole, s.myCoach));
  const trackingReady = useCoachingStore(s => s.trackingReady);
  return {
    // A coached athlete's modules come from his coach: wait for them rather
    // than show tabs that vanish a moment later.
    ready: !coached || trackingReady,
    items: bodyHubItems(tracking, { checkinHasFields: checkinHasAnyField(tracking) }),
  };
}

/**
 * Layout of every Corps page (/nutrition, /weight, /measurements, /checkin,
 * /photos): opened from the tab, from quick add or from a direct link, the page
 * always shows the same sub-tabs. Each route keeps its own TrackingGate.
 */
export default function BodyHub() {
  const { t } = useTranslation();
  const { ready, items } = useBodyHubItems();
  return (
    <div>
      {ready ? <HubTabs label={t('nav.sectionBody')} items={items} /> : null}
      <Outlet />
    </div>
  );
}

/** `/body` (the Corps tab, and old `/body?view=` links) opens the first available sub-page. */
export function BodyHubIndex() {
  const [params] = useSearchParams();
  const { ready, items } = useBodyHubItems();
  if (!ready) return <HubLoading />;
  const target = hubRedirectPath(items, params.get('view')) ?? '/photos';
  return <Navigate to={target} replace />;
}
