import { useTranslation } from 'react-i18next';
import WeightPage from '../weight/WeightPage';
import StepsTracker from '../nutrition/StepsTracker';
import MeasurementsPage from '../measurements/MeasurementsPage';
import PageTransition from '../ui/PageTransition';
import { useClientTracking } from '../../lib/useClientTracking';
import { showNutritionField } from '../../lib/clientTracking';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';

/** Corps › Poids: the weigh-ins, and the daily steps when steps are tracked. */
export function BodyWeightPage() {
  const tracking = useClientTracking();
  return (
    <>
      <WeightPage />
      {showNutritionField(tracking, 'steps') ? (
        <div className="px-4 pb-28">
          <StepsTracker />
        </div>
      ) : null}
    </>
  );
}

/** Corps › Mensurations: the athlete's own measurements (Vision §14.4). */
export function BodyMeasurementsPage() {
  const { t } = useTranslation();
  const userId = useAuthStore(state => state.user?.id ?? null);
  const unitHeight = useProfileStore(state => state.profile?.unit_height ?? 'cm');
  if (!userId) return null;
  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28">
        <h1 className="sr-only">{t('nav.measurements')}</h1>
        <MeasurementsPage userId={userId} unit={unitHeight} />
      </div>
    </PageTransition>
  );
}
