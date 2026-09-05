import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from './stores/authStore';
import { useProfileStore } from './stores/profileStore';
import { useCoachingStore, getPendingInviteToken, getIntendedCoachingRole, isOnboardingDeferred } from './stores/coachingStore';
import { isCoachedAthlete } from './lib/coachRole';
import i18n, { setAppLanguage } from './i18n';
import TrackingGate from './components/coaching/TrackingGate';

import AppLayout from './components/layout/AppLayout';
import AuthPage from './components/auth/AuthPage';
import ResetPasswordPage from './components/auth/ResetPasswordPage';
import InvitePage from './components/coaching/InvitePage';
import OnboardingFlow from './components/onboarding/OnboardingFlow';
import KinesiologyIntakeFlow from './components/onboarding/KinesiologyIntakeFlow';
import {
  intakeGateNeedsUsageProbe,
  shouldForceKinesiologyIntake,
  type IntakeProbeStatus,
  type IntakeUsageSignals,
} from './lib/kinesiologyIntake';
import { probeIntakeUsage } from './lib/kinesiologyIntakeUsage';
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
import InterventionDraftPage from './components/coaching/InterventionDraftPage';
import CoachDashboard from './components/coaching/CoachDashboard';
import ProgramsPage from './components/programs/ProgramsPage';
import ProgramEditorPage from './components/programs/ProgramEditorPage';
import ClientProgramPage from './components/programs/ClientProgramPage';
import AskPrometheusPage from './components/coaching/AskPrometheusPage';
import CoachInboxPage from './components/coaching/CoachInboxPage';
import ClientMessagesPage from './components/coaching/ClientMessagesPage';
import ClientPhotosPage from './components/coaching/ClientPhotosPage';

function HomeDashboard() {
  const coachingRole = useCoachingStore(s => s.coachingRole);
  return coachingRole === 'coach' ? <CoachDashboard /> : <Dashboard />;
}

function CoachOnly({ children }: { children: ReactNode }) {
  const coachingRole = useCoachingStore(s => s.coachingRole);
  if (coachingRole !== 'coach') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function MessagesHome() {
  const coachingRole = useCoachingStore(s => s.coachingRole);
  return coachingRole === 'coach' ? <CoachInboxPage /> : <ClientMessagesPage />;
}

function CoachTrackerRedirect({ children }: { children: ReactNode }) {
  const coachingRole = useCoachingStore(s => s.coachingRole);
  if (coachingRole === 'coach') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function CoachedAthleteRedirect({ children }: { children: ReactNode }) {
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  if (isCoachedAthlete(coachingRole, myCoach)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function ProgramsHome() {
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  if (coachingRole === 'coach') return <ProgramsPage />;
  if (isCoachedAthlete(coachingRole, myCoach)) return <ClientProgramPage />;
  // Solo: the coach program library is not their surface; their templates are routines (see VISION chantier 1).
  return <Navigate to="/workout" replace />;
}

function AppRoutes() {
  const { user, loading: authLoading, initialized, passwordRecovery } = useAuthStore();
  const { profile, loading: profileLoading, fetchError, fetchProfile, clearProfile } = useProfileStore();
  const { roleReady, coachingRole, myCoach, fetchMyRole, fetchMyCoach, acceptInvite, applyIntendedCoachingRole } = useCoachingStore();
  const { t } = useTranslation();
  const [intakeUsage, setIntakeUsage] = useState<IntakeUsageSignals | null>(null);
  const [intakeProbeStatus, setIntakeProbeStatus] = useState<IntakeProbeStatus>('idle');

  const skipPersonalOnboarding =
    coachingRole === 'coach' || getIntendedCoachingRole() === 'coach';
  const coachedClient =
    isCoachedAthlete(coachingRole, myCoach)
    || coachingRole === 'client';
  const needsIntakeProbe = !profileLoading && roleReady && intakeGateNeedsUsageProbe({
    isCoachedClient: coachedClient,
    isCoach: skipPersonalOnboarding,
    profile,
  });

  useEffect(() => {
    if (user) {
      fetchProfile(user.id);
      void (async () => {
        try {
          const token = getPendingInviteToken();
          if (token) {
            await acceptInvite(token);
          } else {
            await applyIntendedCoachingRole();
          }
        } finally {
          await fetchMyRole(user.id);
          await fetchMyCoach();
        }
      })();
    } else if (initialized) {
      clearProfile();
      useCoachingStore.getState().clear();
    }
  }, [user, initialized, fetchProfile, clearProfile, fetchMyRole, fetchMyCoach, acceptInvite, applyIntendedCoachingRole]);

  // The account's language wins over this device's default (Profil → Langue is written to user_profiles).
  const profileLanguage = profile?.language;
  useEffect(() => {
    if (!profileLanguage) return;
    const wanted = profileLanguage.toLowerCase().startsWith('en') ? 'en' : 'fr';
    if (!i18n.language.toLowerCase().startsWith(wanted)) setAppLanguage(wanted);
  }, [profileLanguage]);

  useEffect(() => {
    if (!user || !needsIntakeProbe) {
      setIntakeUsage(null);
      setIntakeProbeStatus('idle');
      return;
    }
    let cancelled = false;
    setIntakeProbeStatus('pending');
    void probeIntakeUsage(user.id)
      .then(signals => {
        if (!cancelled) {
          setIntakeUsage(signals);
          setIntakeProbeStatus('ok');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIntakeUsage(null);
          setIntakeProbeStatus('failed');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, needsIntakeProbe]);

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

  const deferClientOnboarding =
    coachedClient
    || (isOnboardingDeferred() && !!myCoach);

  if (needsIntakeProbe && (intakeProbeStatus === 'idle' || intakeProbeStatus === 'pending')) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (shouldForceKinesiologyIntake({
    isCoachedClient: coachedClient,
    isCoach: skipPersonalOnboarding,
    profile,
    usage: intakeUsage,
    probeStatus: intakeProbeStatus,
  })) {
    return (
      <Routes>
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="*" element={<KinesiologyIntakeFlow />} />
      </Routes>
    );
  }

  if (!profile?.onboarding_completed && !skipPersonalOnboarding && !deferClientOnboarding) {
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
        <Route path="/workout" element={<CoachTrackerRedirect><TrackingGate module="workouts"><WorkoutPage /></TrackingGate></CoachTrackerRedirect>} />
        <Route path="/nutrition" element={<CoachTrackerRedirect><TrackingGate module="nutrition"><NutritionPage /></TrackingGate></CoachTrackerRedirect>} />
        <Route path="/weight" element={<CoachTrackerRedirect><TrackingGate module="weight"><WeightPage /></TrackingGate></CoachTrackerRedirect>} />
        <Route path="/calendar" element={<CoachTrackerRedirect><CoachedAthleteRedirect><CalendarPage /></CoachedAthleteRedirect></CoachTrackerRedirect>} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/exercise-progress" element={<CoachTrackerRedirect><CoachedAthleteRedirect><ExerciseProgressPage /></CoachedAthleteRedirect></CoachTrackerRedirect>} />
        <Route path="/stats" element={<CoachTrackerRedirect><CoachedAthleteRedirect><StatsPage /></CoachedAthleteRedirect></CoachTrackerRedirect>} />
        <Route path="/checkin" element={<CoachTrackerRedirect><TrackingGate module="checkins"><CheckInPage /></TrackingGate></CoachTrackerRedirect>} />
        <Route path="/clients" element={<CoachOnly><ClientsPage /></CoachOnly>} />
        <Route path="/clients/:id" element={<CoachOnly><ClientDetailPage /></CoachOnly>} />
        <Route path="/clients/:id/setup" element={<CoachOnly><ClientSetupPage /></CoachOnly>} />
        <Route path="/clients/:id/draft/:interventionId" element={<CoachOnly><InterventionDraftPage /></CoachOnly>} />
        <Route path="/inbox/:interventionId" element={<CoachOnly><InterventionDraftPage /></CoachOnly>} />
        <Route path="/messages" element={<MessagesHome />} />
        <Route path="/messages/:clientId" element={<CoachOnly><CoachInboxPage /></CoachOnly>} />
        <Route path="/photos" element={<CoachTrackerRedirect><ClientPhotosPage /></CoachTrackerRedirect>} />
        <Route path="/prometheus" element={<CoachOnly><AskPrometheusPage /></CoachOnly>} />
        <Route path="/programs" element={<ProgramsHome />} />
        <Route path="/programs/new" element={<CoachOnly><ProgramEditorPage /></CoachOnly>} />
        <Route path="/programs/:id" element={<CoachOnly><ProgramEditorPage /></CoachOnly>} />
      </Route>
      <Route path="/workout/new" element={<CoachTrackerRedirect><TrackingGate module="workouts"><WorkoutForm /></TrackingGate></CoachTrackerRedirect>} />
      <Route path="/workout/:id" element={<CoachTrackerRedirect><TrackingGate module="workouts"><WorkoutForm /></TrackingGate></CoachTrackerRedirect>} />
      <Route path="/routines" element={<AppLayout />}>
        <Route index element={<CoachTrackerRedirect><CoachedAthleteRedirect><RoutinesPage /></CoachedAthleteRedirect></CoachTrackerRedirect>} />
      </Route>
      <Route path="/scanner" element={<CoachTrackerRedirect><TrackingGate module="nutrition"><ScannerPage /></TrackingGate></CoachTrackerRedirect>} />
      <Route path="/recipes" element={<CoachTrackerRedirect><CoachedAthleteRedirect><RecipesPage /></CoachedAthleteRedirect></CoachTrackerRedirect>} />
      <Route path="/intake" element={<KinesiologyIntakeFlow allowExit />} />
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
