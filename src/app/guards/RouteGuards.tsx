import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAccountContext } from '../../lib/useAccountContext';
import { useTranslation } from 'react-i18next';
import { useCoachingStore } from '../../stores/coachingStore';
import { useAuthStore } from '../../stores/authStore';
import ErrorState from '../../components/ui/ErrorState';

export function RouteFallback() {
  const { t } = useTranslation();
  const error = useCoachingStore(s => s.coachingRoleError);
  const fetchMyRole = useCoachingStore(s => s.fetchMyRole);
  const fetchMyCoach = useCoachingStore(s => s.fetchMyCoach);
  const userId = useAuthStore(s => s.user?.id);
  if (error && userId) return <ErrorState title={t('errors.loadRole')}
    onRetry={() => { void fetchMyRole(userId).then(() => fetchMyCoach()); }} />;
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
    </div>
  );
}

export function CoachOnly({ children }: { children: ReactNode }) {
  const context = useAccountContext();
  if (!context.ready) return <RouteFallback />;
  if (!context.capabilities.coach) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function CoachTrackerRedirect({ children }: { children: ReactNode }) {
  const context = useAccountContext();
  if (!context.ready) return <RouteFallback />;
  if (!context.personalToolsAvailable) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function CoachedAthleteRedirect({ children }: { children: ReactNode }) {
  const context = useAccountContext();
  if (!context.ready) return <RouteFallback />;
  if (context.personalCoaching === 'coached') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
