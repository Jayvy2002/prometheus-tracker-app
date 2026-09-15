import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAccountContext } from '../../lib/useAccountContext';

export function RouteFallback() {
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
