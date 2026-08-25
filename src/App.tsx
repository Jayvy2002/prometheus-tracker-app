import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from './stores/authStore';
import { useProfileStore } from './stores/profileStore';
import { useCoachingStore, getPendingInviteToken } from './stores/coachingStore';

import AppLayout from './components/layout/AppLayout';
import AuthPage from './components/auth/AuthPage';
import ResetPasswordPage from './components/auth/ResetPasswordPage';
import InvitePage from './components/coaching/InvitePage';
import OnboardingFlow from './components/onboarding/OnboardingFlow';
import Dashboard from './components/dashboard/Dashboard';
import WorkoutPage from './components/workout/WorkoutPage';
import WorkoutForm from './components/workout/WorkoutForm';
import ExerciseProgressPage from './components/workout/ExerciseProgressPage';
import StatsPage from './components/stats/StatsPage';
import RoutinesPage from './components/routines/RoutinesPage';
import WeightPage from './components/weight/WeightPage';
import NutritionPage from './components/nutrition/NutritionPage';
import ScannerPage from './components/scanner/ScannerPage';
import ProfilePage from './components/profile/ProfilePage';
import CalendarPage from './components/calendar/CalendarPage';
import RecipesPage from './components/nutrition/RecipesPage';
import CheckInPage from './components/checkin/CheckInPage';
import ClientsPage from './components/coaching/ClientsPage';
import ClientDetailPage from './components/coaching/ClientDetailPage';
import ClientSetupPage from './components/coaching/ClientSetupPage';
import CoachDashboard from './components/coaching/CoachDashboard';
import ProgramsPage from './components/programs/ProgramsPage';

function HomeDashboard() {
  const coachingRole = useCoachingStore(s => s.coachingRole);
  return coachingRole === 'coach' ? <CoachDashboard /> : <Dashboard />;
}

function CoachTrackerRedirect({ children }: { children: ReactNode }) {
  const coachingRole = useCoachingStore(s => s.coachingRole);
  if (coachingRole === 'coach') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading: authLoading, initialized, passwordRecovery } = useAuthStore();
  const { profile, loading: profileLoading, fetchError, fetchProfile, clearProfile } = useProfileStore();
  const { roleReady, fetchMyRole, fetchMyCoach, acceptInvite, applyIntendedCoachingRole } = useCoachingStore();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (user) {
      fetchProfile(user.id);
      void fetchMyRole(user.id);
      void (async () => {
        const token = getPendingInviteToken();
        if (token) {
          await acceptInvite(token);
        } else {
          await applyIntendedCoachingRole();
        }
        await fetchMyRole(user.id);
        await fetchMyCoach();
      })();
    } else if (initialized) {
      clearProfile();
      useCoachingStore.getState().clear();
    }
  }, [user, initialized, fetchProfile, clearProfile, fetchMyRole, fetchMyCoach, acceptInvite, applyIntendedCoachingRole]);

  useEffect(() => {
    if (profile?.language) {
      i18n.changeLanguage(profile.language);
    }
  }, [profile?.language, i18n]);

  if (authLoading || !initialized) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <img src="/logo.svg" alt="Prometheus" className="w-10 h-10 animate-pulse" />
      </div>
    );
  }

  if (passwordRecovery) {
    return <ResetPasswordPage />;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }

  if (profileLoading || !roleReady) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (fetchError && !profile) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 gap-4">
        <p className="text-sm text-neutral-300 text-center max-w-sm">{t('errors.loadProfile')}</p>
        <button
          onClick={() => fetchProfile(user.id)}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500"
        >
          {t('errors.retry')}
        </button>
      </div>
    );
  }

  if (!profile?.onboarding_completed) {
    return (
      <Routes>
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="*" element={<OnboardingFlow />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<HomeDashboard />} />
        <Route path="/workout" element={<CoachTrackerRedirect><WorkoutPage /></CoachTrackerRedirect>} />
        <Route path="/nutrition" element={<CoachTrackerRedirect><NutritionPage /></CoachTrackerRedirect>} />
        <Route path="/weight" element={<CoachTrackerRedirect><WeightPage /></CoachTrackerRedirect>} />
        <Route path="/calendar" element={<CoachTrackerRedirect><CalendarPage /></CoachTrackerRedirect>} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/exercise-progress" element={<CoachTrackerRedirect><ExerciseProgressPage /></CoachTrackerRedirect>} />
        <Route path="/stats" element={<CoachTrackerRedirect><StatsPage /></CoachTrackerRedirect>} />
        <Route path="/checkin" element={<CoachTrackerRedirect><CheckInPage /></CoachTrackerRedirect>} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/:id" element={<ClientDetailPage />} />
        <Route path="/clients/:id/setup" element={<ClientSetupPage />} />
        <Route path="/programs" element={<ProgramsPage />} />
      </Route>
      <Route path="/workout/new" element={<CoachTrackerRedirect><WorkoutForm /></CoachTrackerRedirect>} />
      <Route path="/workout/:id" element={<CoachTrackerRedirect><WorkoutForm /></CoachTrackerRedirect>} />
      <Route path="/routines" element={<AppLayout />}>
        <Route index element={<RoutinesPage />} />
      </Route>
      <Route path="/scanner" element={<CoachTrackerRedirect><ScannerPage /></CoachTrackerRedirect>} />
      <Route path="/recipes" element={<CoachTrackerRedirect><RecipesPage /></CoachTrackerRedirect>} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
