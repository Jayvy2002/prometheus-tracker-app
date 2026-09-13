import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import SideNav from './SideNav';
import CoachProfileButton from './CoachProfileButton';
import FAB from './FAB';
import { ToastContainer } from '../ui/Toast';
import { useCoachingStore } from '../../stores/coachingStore';
import CoachCommandPalette from '../coaching/CoachCommandPalette';
import { trackScreen } from '../../lib/telemetryClient';
import { useEffect } from 'react';
import { resolveAccountContext } from '../../lib/accountContext';
import WorkspaceSwitcher from './WorkspaceSwitcher';

export default function AppLayout() {
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const roleReady = useCoachingStore(s => s.roleReady);
  const snapshot = useCoachingStore(s => s.accountSnapshot);
  const workspace = useCoachingStore(s => s.accountWorkspace);
  const startCoachRealtime = useCoachingStore(s => s.startCoachRealtime);
  const stopCoachRealtime = useCoachingStore(s => s.stopCoachRealtime);
  const startClientRealtime = useCoachingStore(s => s.startClientRealtime);
  const stopClientRealtime = useCoachingStore(s => s.stopClientRealtime);
  const context = resolveAccountContext(coachingRole, myCoach, roleReady, snapshot, workspace);
  const isCoach = context.activeWorkspace === 'coaching';
  const location = useLocation();
  const hideFab = isCoach || location.pathname.startsWith('/dashboard');

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
        {context.capabilities.coach && context.personalToolsAvailable && (
          <div className="md:hidden sticky top-0 z-30 flex min-h-14 items-center gap-3 px-3 bg-neutral-950/95 backdrop-blur-md border-b border-neutral-800">
            <WorkspaceSwitcher className="flex-1" />
            {isCoach && !location.pathname.startsWith('/profile') && <CoachProfileButton />}
          </div>
        )}
        <div className={`mx-auto w-full ${isCoach ? 'max-w-6xl' : 'max-w-3xl'}`}>
          <Outlet />
        </div>
      </main>

      {!hideFab && <FAB />}
      <BottomNav />
    </div>
  );
}
