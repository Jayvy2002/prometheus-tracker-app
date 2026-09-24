import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import SideNav from './SideNav';
import FAB from './FAB';
import { ToastContainer } from '@/shared/ui/Toast';
import { useCoachingStore } from '../../stores/coachingStore';
import GlobalSearchPalette from '../../components/search/GlobalSearchPalette';
import { trackScreen } from '../../lib/telemetryClient';
import { useEffect } from 'react';
import { useAccountContext } from '@/features/account/hooks/useAccountContext';
import AssignedQuestionnaireBanner from '../../components/onboarding/AssignedQuestionnaireBanner';
import SessionResumeBar from '../../components/workout/SessionResumeBar';
import { useResumableWorkout } from '@/features/workout/hooks/useResumableWorkout';
import { quickAddVisible } from '@/app/navigation/navConfig';

export default function AppLayout() {
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const startCoachRealtime = useCoachingStore(s => s.startCoachRealtime);
  const stopCoachRealtime = useCoachingStore(s => s.stopCoachRealtime);
  const startClientRealtime = useCoachingStore(s => s.startClientRealtime);
  const stopClientRealtime = useCoachingStore(s => s.stopClientRealtime);
  const context = useAccountContext();
  const isCoach = context.activeWorkspace === 'coaching';
  const location = useLocation();
  const resumable = useResumableWorkout();
  // Quick add stays on Today, the training page and the reading pages. Pages
  // with their own main action or a form (logger, messages, check-in, nutrition,
  // weight, programs…) never get a second floating button over it. With a
  // resume bar the FAB sits above it instead of disappearing.
  const hideFab = isCoach || !quickAddVisible(location.pathname);

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
      <GlobalSearchPalette />

      <SideNav />

      <main className="flex-1 min-w-0 pb-24 md:pb-8 md:ml-64">
        {/* Today uses the desktop width in two columns; reading pages stay narrow. */}
        <div className={`mx-auto w-full ${isCoach ? 'max-w-6xl' : location.pathname === '/dashboard' ? 'max-w-3xl lg:max-w-6xl' : 'max-w-3xl'}`}>
          <AssignedQuestionnaireBanner />
          <Outlet />
        </div>
      </main>

      {!hideFab && <FAB raised={!!resumable} />}
      {!isCoach && <SessionResumeBar />}
      <BottomNav />
    </div>
  );
}
