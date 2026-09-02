import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useCoachingStore } from '../../stores/coachingStore';
import { isCoachedAthlete } from '../../lib/coachRole';
import { showModule, type TrackingModuleKey } from '../../lib/clientTracking';
import GymLoader from '../ui/GymLoader';

export default function TrackingGate({
  module,
  children,
}: {
  module: TrackingModuleKey;
  children: ReactNode;
}) {
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const tracking = useCoachingStore(s => s.myTrackingConfig);
  const trackingReady = useCoachingStore(s => s.trackingReady);
  const coached = isCoachedAthlete(coachingRole, myCoach);

  if (coached && !trackingReady) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <GymLoader size="sm" />
      </div>
    );
  }
  if (coached && !showModule(tracking, module)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
