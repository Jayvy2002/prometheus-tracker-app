import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from './stores/authStore';
import { useProfileStore } from './stores/profileStore';
import { useSubscriptionStore } from './stores/subscriptionStore';
import PaywallModal from './components/premium/PaywallModal';
import AppLayout from './components/layout/AppLayout';
import AuthPage from './components/auth/AuthPage';
import OnboardingFlow from './components/onboarding/OnboardingFlow';
import Dashboard from './components/dashboard/Dashboard';
import WorkoutPage from './components/workout/WorkoutPage';
import WorkoutForm from './components/workout/WorkoutForm';
import ExerciseProgressPage from './components/workout/ExerciseProgressPage';
import RoutinesPage from './components/routines/RoutinesPage';
import NutritionPage from './components/nutrition/NutritionPage';
import ScannerPage from './components/scanner/ScannerPage';
import ProfilePage from './components/profile/ProfilePage';
import RecipesPage from './components/nutrition/RecipesPage';
import CoachingPage from './components/coaching/CoachingPage';
import ProgressPage from './components/progress/ProgressPage';

function AppRoutes() {
  const { user, loading: authLoading, initialized } = useAuthStore();
  const { profile, loading: profileLoading, fetchProfile, clearProfile } = useProfileStore();
  const { fetchSubscription, clearSubscription } = useSubscriptionStore();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (user) {
      fetchProfile(user.id);
      fetchSubscription(user.id);
    } else if (initialized) {
      clearProfile();
      clearSubscription();
    }
  }, [user, initialized]);

  useEffect(() => {
    if (profile?.language) {
      i18n.changeLanguage(profile.language);
    }
  }, [profile?.language]);

  if (authLoading || !initialized) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <img src="/logo.svg" alt="Prometheus" className="w-10 h-10 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile?.onboarding_completed) {
    return <OnboardingFlow />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/workout" element={<WorkoutPage />} />
        <Route path="/nutrition" element={<NutritionPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/coaching" element={<CoachingPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/exercise-progress" element={<ExerciseProgressPage />} />
        <Route path="/routines" element={<RoutinesPage />} />
      </Route>
      <Route path="/workout/new" element={<WorkoutForm />} />
      <Route path="/workout/:id" element={<WorkoutForm />} />
      <Route path="/scanner" element={<ScannerPage />} />
      <Route path="/recipes" element={<RecipesPage />} />
      {/* Redirects for old routes */}
      <Route path="/weight" element={<Navigate to="/progress" replace />} />
      <Route path="/stats" element={<Navigate to="/progress" replace />} />
      <Route path="/calendar" element={<Navigate to="/progress" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  return (
    <BrowserRouter>
      <AppRoutes />
      <PaywallModal />
    </BrowserRouter>
  );
}
