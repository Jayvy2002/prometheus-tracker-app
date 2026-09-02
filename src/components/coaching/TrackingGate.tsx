import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCoachingStore } from '../../stores/coachingStore';
import { isCoachedAthlete } from '../../lib/coachRole';
import { showModule, type TrackingModuleKey } from '../../lib/clientTracking';

export default function TrackingGate({
  module,
  children,
}: {
  module: TrackingModuleKey;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const tracking = useCoachingStore(s => s.myTrackingConfig);
  const trackingReady = useCoachingStore(s => s.trackingReady);
  const coached = isCoachedAthlete(coachingRole, myCoach);

  if (coached && !trackingReady) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" aria-label={t('common.loading')} />
      </div>
    );
  }
  if (coached && !showModule(tracking, module)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
