import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import NutritionPage from '../nutrition/NutritionPage';
import WeightPage from '../weight/WeightPage';
import CheckInPage from '../checkin/CheckInPage';
import ClientPhotosPage from '../coaching/ClientPhotosPage';
import StepsTracker from '../nutrition/StepsTracker';
import MeasurementsPage from '../measurements/MeasurementsPage';
import HubTabs from './HubTabs';
import { useClientTracking } from '../../lib/useClientTracking';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { checkinHasAnyField, showModule, showNutritionField } from '../../lib/clientTracking';

type View = 'nutrition' | 'weight' | 'measurements' | 'checkin' | 'photos';

/**
 * Corps : ce qui se logge sur soi. Seuls les modules actifs apparaissent :
 * un module coupé par le coach n'est pas une vue vide, il n'existe pas.
 * Les photos (privées par défaut) sont toujours là. Les mensurations suivent
 * le module poids (composition corporelle, Vision §14.4).
 */
export default function BodyHub() {
  const { t } = useTranslation();
  const tracking = useClientTracking();
  const [params, setParams] = useSearchParams();
  const userId = useAuthStore(state => state.user?.id ?? null);
  const unitHeight = useProfileStore(state => state.profile?.unit_height ?? 'cm');
  const views: View[] = [
    ...(showModule(tracking, 'nutrition') ? ['nutrition' as const] : []),
    ...(showModule(tracking, 'weight') ? ['weight' as const, 'measurements' as const] : []),
    ...(showModule(tracking, 'checkins') && checkinHasAnyField(tracking) ? ['checkin' as const] : []),
    'photos',
  ];
  const requested = params.get('view') as View | null;
  const view: View = requested && views.includes(requested) ? requested : views[0];
  const labels: Record<View, string> = {
    nutrition: t('nav.nutrition'),
    weight: t('nav.weight'),
    measurements: t('nav.measurements'),
    checkin: t('nav.checkin'),
    photos: t('nav.photos'),
  };

  return (
    <div>
      <HubTabs label={t('nav.sectionBody')} views={views} value={view} labels={labels} onChange={next => setParams({ view: next })} />
      {view === 'nutrition' ? <NutritionPage /> : null}
      {view === 'weight' ? (
        <>
          <WeightPage />
          {showNutritionField(tracking, 'steps') ? (
            <div className="px-4 pb-28">
              <StepsTracker />
            </div>
          ) : null}
        </>
      ) : null}
      {view === 'measurements' && userId ? (
        <div className="px-4 pt-6 pb-28">
          <MeasurementsPage userId={userId} unit={unitHeight} />
        </div>
      ) : null}
      {view === 'checkin' ? <CheckInPage /> : null}
      {view === 'photos' ? <ClientPhotosPage /> : null}
    </div>
  );
}
