import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import SideNav from './SideNav';
import CoachProfileButton from './CoachProfileButton';
import FAB from './FAB';
import { ToastContainer } from '../ui/Toast';
import { useCoachingStore } from '../../stores/coachingStore';
import CoachCommandPalette from '../coaching/CoachCommandPalette';
import { useEffect } from 'react';

export default function AppLayout() {
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const startCoachRealtime = useCoachingStore(s => s.startCoachRealtime);
  const stopCoachRealtime = useCoachingStore(s => s.stopCoachRealtime);
  const startClientRealtime = useCoachingStore(s => s.startClientRealtime);
  const stopClientRealtime = useCoachingStore(s => s.stopClientRealtime);
  const isCoach = coachingRole === 'coach';
  const location = useLocation();
  const hideFab = isCoach || location.pathname.startsWith('/dashboard');

  useEffect(() => {
    if (isCoach) {
      stopClientRealtime();
      void startCoachRealtime();
      return () => stopCoachRealtime();
    }
    if (coachingRole === 'client') {
      stopCoachRealtime();
      void startClientRealtime();
      return () => stopClientRealtime();
    }
    stopCoachRealtime();
    stopClientRealtime();
  }, [isCoach, coachingRole, startCoachRealtime, stopCoachRealtime, startClientRealtime, stopClientRealtime]);

  return (
    <div className="min-h-screen bg-black text-white flex">
      <ToastContainer />
      <CoachCommandPalette />

      <SideNav />

      <main className="flex-1 min-w-0 pb-24 md:pb-8 md:ml-64">
        {isCoach && !location.pathname.startsWith('/profile') && (
          <div className="md:hidden sticky top-0 z-30 flex h-12 items-center justify-end px-4 bg-neutral-950/95 backdrop-blur-md border-b border-neutral-800">
            <CoachProfileButton />
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
