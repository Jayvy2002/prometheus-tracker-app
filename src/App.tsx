import { useEffect } from 'react';
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
import ProgramsPage from './components/programs/ProgramsPage';

function AppRoutes() {
  const { user, loading: authLoading, initialized, passwordRecovery } = useAuthStore();
  const { profile, loading: profileLoading, fetchError, fetchProfile, clearProfile } = useProfileStore();
  const { fetchMyRole, fetchMyCoach, acceptInvite } = useCoachingStore();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (user) {
      fetchProfile(user.id);
      fetchMyRole(user.id);
      fetchMyCoach();
      const token = getPendingInviteToken();
      if (token) {
        void acceptInvite(token);
      }
    } else if (initialized) {
      clearProfile();
      useCoachingStore.getState().clear();
    }
  }, [user, initialized, fetchProfile, clearProfile, fetchMyRole, fetchMyCoach, acceptInvite]);

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

  if (profileLoading) {
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
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/workout" element={<WorkoutPage />} />
        <Route path="/nutrition" element={<NutritionPage />} />
        <Route path="/weight" element={<WeightPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/exercise-progress" element={<ExerciseProgressPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/checkin" element={<CheckInPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/:id" element={<ClientDetailPage />} />
        <Route path="/programs" element={<ProgramsPage />} />
      </Route>
      <Route path="/workout/new" element={<WorkoutForm />} />
      <Route path="/workout/:id" element={<WorkoutForm />} />
      <Route path="/routines" element={<AppLayout />}>
        <Route index element={<RoutinesPage />} />
      </Route>
      <Route path="/scanner" element={<ScannerPage />} />
      <Route path="/recipes" element={<RecipesPage />} />
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
