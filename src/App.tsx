import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useProfileStore } from './stores/profileStore';
import AppLayout from './components/layout/AppLayout';
import AuthPage from './components/auth/AuthPage';
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
import HealthIntegrations from './components/health/HealthIntegrations';
import CalendarPage from './components/calendar/CalendarPage';
import RecipesPage from './components/nutrition/RecipesPage';

function AppRoutes() {
  const { user, loading: authLoading, initialized } = useAuthStore();
  const { profile, loading: profileLoading, fetchProfile, clearProfile } = useProfileStore();

  useEffect(() => {
    if (user) {
      fetchProfile(user.id);
    } else if (initialized) {
      clearProfile();
    }
  }, [user, initialized]);

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
        <Route path="/weight" element={<WeightPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/exercise-progress" element={<ExerciseProgressPage />} />
        <Route path="/stats" element={<StatsPage />} />
      </Route>
      <Route path="/workout/new" element={<WorkoutForm />} />
      <Route path="/workout/:id" element={<WorkoutForm />} />
      <Route path="/routines" element={<AppLayout />}>
        <Route index element={<RoutinesPage />} />
      </Route>
      <Route path="/scanner" element={<ScannerPage />} />
      <Route path="/recipes" element={<RecipesPage />} />
      <Route path="/health" element={<HealthIntegrations />} />
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
    </BrowserRouter>
  );
}
