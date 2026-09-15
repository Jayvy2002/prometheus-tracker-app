import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import SideNav from './SideNav';
import FAB from './FAB';
import { ToastContainer } from '@/shared/ui/Toast';
import { useCoachingStore } from '../../stores/coachingStore';
import CoachCommandPalette from '../../components/coaching/CoachCommandPalette';
import { trackScreen } from '../../lib/telemetryClient';
import { useEffect } from 'react';
import { useAccountContext } from '@/features/account/hooks/useAccountContext';
import AssignedQuestionnaireBanner from '../../components/onboarding/AssignedQuestionnaireBanner';

export default function AppLayout() {
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const startCoachRealtime = useCoachingStore(s => s.startCoachRealtime);
  const stopCoachRealtime = useCoachingStore(s => s.stopCoachRealtime);
  const startClientRealtime = useCoachingStore(s => s.startClientRealtime);
  const stopClientRealtime = useCoachingStore(s => s.stopClientRealtime);
  const context = useAccountContext();
  const isCoach = context.activeWorkspace === 'coaching';
  const location = useLocation();
  const hideFab = isCoach
    || location.pathname.startsWith('/coaches')
    || location.pathname === '/coach/profile'
    || location.pathname === '/coaching-requests'
    || location.pathname.startsWith('/messages')
    || location.pathname.startsWith('/checkin');

  useEffect(() => {
    trackScreen(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (isCoach) {
      stopClientRealtime();
      void startCoachRealtime();
      return () => stopCoachRealtime();
    }
    stopCoachRealtime();
    void startClientRealtime();
    return () => stopClientRealtime();
  }, [isCoach, coachingRole, startCoachRealtime, stopCoachRealtime, startClientRealtime, stopClientRealtime]);

  return (
    <div className="min-h-screen bg-black text-white flex">
      <ToastContainer />
      <CoachCommandPalette />

      <SideNav />

      <main className="flex-1 min-w-0 pb-24 md:pb-8 md:ml-64">
        <div className={`mx-auto w-full ${isCoach ? 'max-w-6xl' : 'max-w-3xl'}`}>
          <AssignedQuestionnaireBanner />
          <Outlet />
        </div>
      </main>

      {!hideFab && <FAB />}
      <BottomNav />
    </div>
  );
}
