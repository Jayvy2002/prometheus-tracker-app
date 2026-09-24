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
import { quickAddVisible, mobileTabs, navPersona, profileShortcutVisible } from '@/app/navigation/navConfig';
import { useClientTracking } from '@/features/coaching/hooks/useClientTracking';
import ProfileAvatarLink from './ProfileAvatarLink';

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
  const tracking = useClientTracking();
  // Profil is a tab for the Solo and the Coach. The coached athlete keeps
  // Messages as fifth tab: his avatar opens Profil from every main page.
  const showProfileShortcut = profileShortcutVisible(
    location.pathname,
    mobileTabs(navPersona(context), tracking),
  );

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
          {showProfileShortcut && (
            <div className="md:hidden px-4 pt-3" data-testid="profile-shortcut">
              <ProfileAvatarLink />
            </div>
          )}
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
