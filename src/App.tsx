import { useEffect, useRef, useState, lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from './stores/authStore';
import { useProfileStore } from './stores/profileStore';
import { useWorkoutStore } from './stores/workoutStore';
import { useCoachingStore, getPendingInviteToken, getIntendedCoachingRole, isOnboardingDeferred } from './stores/coachingStore';
import { resetSessionStores } from './lib/resetStores';
import { getSessionOwner } from './lib/sessionScope';
import { detachPushOnLogout } from './lib/notifications';
import { isCoachedAthlete } from './lib/coachRole';
import { resolveAccountContext } from './lib/accountContext';
import i18n, { setAppLanguage } from './i18n';
import ActiveRelationshipBoundary from './components/coaching/ActiveRelationshipBoundary';
import TrackingGate from './components/coaching/TrackingGate';

import AppLayout from './components/layout/AppLayout';
import AuthPage from './components/auth/AuthPage';
import ResetPasswordPage from './components/auth/ResetPasswordPage';
import InvitePage from './components/coaching/InvitePage';
// Q05 : routes en lazy — le bundle initial ne porte que l'auth + le shell.
// Scanner (barcode-detector) et stats (recharts) partent dans leurs propres chunks.
const OnboardingFlow = lazy(() => import('./components/onboarding/OnboardingFlow'));
const KinesiologyIntakeFlow = lazy(() => import('./components/onboarding/KinesiologyIntakeFlow'));
import {
  intakeGateNeedsUsageProbe,
  shouldForceKinesiologyIntake,
  type IntakeProbeStatus,
  type IntakeUsageSignals,
} from './lib/kinesiologyIntake';
import { listQuestionnaireResponses, type QuestionnaireResponse } from './lib/coachQuestionnaireApi';
import { probeIntakeUsage } from './lib/kinesiologyIntakeUsage';
import Dashboard from './components/dashboard/Dashboard';
const WorkoutPage = lazy(() => import('./components/workout/WorkoutPage'));
const WorkoutForm = lazy(() => import('./components/workout/WorkoutForm'));
const ExerciseProgressPage = lazy(() => import('./components/workout/ExerciseProgressPage'));
const StatsPage = lazy(() => import('./components/stats/StatsPage'));
const RoutinesPage = lazy(() => import('./components/routines/RoutinesPage'));
const WeightPage = lazy(() => import('./components/weight/WeightPage'));
const NutritionPage = lazy(() => import('./components/nutrition/NutritionPage'));
const ScannerPage = lazy(() => import('./components/scanner/ScannerPage'));
const ProfilePage = lazy(() => import('./components/profile/ProfilePage'));
const CalendarPage = lazy(() => import('./components/calendar/CalendarPage'));
const RecipesPage = lazy(() => import('./components/nutrition/RecipesPage'));
const CheckInPage = lazy(() => import('./components/checkin/CheckInPage'));
const ClientsPage = lazy(() => import('./components/coaching/ClientsPage'));
const ClientDetailPage = lazy(() => import('./components/coaching/ClientDetailPage'));
const ClientSetupPage = lazy(() => import('./components/coaching/ClientSetupPage'));
const InterventionDraftPage = lazy(() => import('./components/coaching/InterventionDraftPage'));
const CoachDashboard = lazy(() => import('./components/coaching/CoachDashboard'));
const ProgramsPage = lazy(() => import('./components/programs/ProgramsPage'));
const ProgramEditorPage = lazy(() => import('./components/programs/ProgramEditorPage'));
const ClientProgramPage = lazy(() => import('./components/programs/ClientProgramPage'));
const AskPrometheusPage = lazy(() => import('./components/coaching/AskPrometheusPage'));
const CoachInboxPage = lazy(() => import('./components/coaching/CoachInboxPage'));
const ClientMessagesPage = lazy(() => import('./components/coaching/ClientMessagesPage'));
const ClientPhotosPage = lazy(() => import('./components/coaching/ClientPhotosPage'));
const CoachQuestionnairePage = lazy(() => import('./components/coaching/CoachQuestionnairePage'));
const ClientQuestionnairePanel = lazy(() => import('./components/onboarding/ClientQuestionnairePanel'));
const CoachLearnedPage = lazy(() => import('./components/coaching/CoachLearnedPage'));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
    </div>
  );
}

function useAccountContext() {
  const role = useCoachingStore(s => s.coachingRole);
  const coach = useCoachingStore(s => s.myCoach);
  const ready = useCoachingStore(s => s.roleReady);
  const snapshot = useCoachingStore(s => s.accountSnapshot);
  return resolveAccountContext(role, coach, ready, snapshot);
}

function HomeDashboard() {
  const context = useAccountContext();
  if (!context.ready) return <RouteFallback />;
  return context.defaultWorkspace === 'coaching' ? <CoachDashboard /> : <Dashboard />;
}

function CoachOnly({ children }: { children: ReactNode }) {
  const context = useAccountContext();
  if (!context.ready) return <RouteFallback />;
  if (!context.capabilities.coach) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function MessagesHome() {
  const context = useAccountContext();
  if (!context.ready) return <RouteFallback />;
  return context.defaultWorkspace === 'coaching' ? <CoachInboxPage /> : <ClientMessagesPage />;
}

function CoachTrackerRedirect({ children }: { children: ReactNode }) {
  const context = useAccountContext();
  if (!context.ready) return <RouteFallback />;
  if (!context.personalToolsAvailable) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function CoachedAthleteRedirect({ children }: { children: ReactNode }) {
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  if (isCoachedAthlete(coachingRole, myCoach)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function ProgramsHome() {
  const context = useAccountContext();
  if (!context.ready) return <RouteFallback />;
  if (context.defaultWorkspace === 'coaching') return <ProgramsPage />;
  return <ClientProgramPage />;
}

function AppRoutes() {
  const { user, loading: authLoading, initialized, passwordRecovery } = useAuthStore();
  const { profile, loading: profileLoading, fetchError, fetchProfile, updateProfile } = useProfileStore();
  const { roleReady, coachingRole, myCoach, fetchMyRole, fetchMyCoach, applyIntendedCoachingRole } = useCoachingStore();
  const { t } = useTranslation();
  const location = useLocation();
  const [intakeUsage, setIntakeUsage] = useState<IntakeUsageSignals | null>(null);
  const [intakeProbeStatus, setIntakeProbeStatus] = useState<IntakeProbeStatus>('idle');
  const userId = user?.id ?? null;
  const timezoneWriteFor = useRef<string | null>(null);
  const assignmentScope = userId && myCoach?.id && coachingRole !== 'coach' ? userId + ':' + myCoach.id : null;
  const [assignment, setAssignment] = useState<{ scope: string; status: 'ready' | 'failed'; response: QuestionnaireResponse | null } | null>(null);
  const [assignmentRetry, setAssignmentRetry] = useState(0);
  const activeAssignment = assignmentScope && assignment?.scope === assignmentScope ? assignment : null;
  useEffect(() => {
    let cancelled = false;
    setAssignment(null);
    if (!assignmentScope || !userId || !myCoach?.id || !roleReady) return;
    const coachId = myCoach.id;
    listQuestionnaireResponses(userId).then(rows => {
      if (!cancelled) setAssignment({ scope: assignmentScope, status: 'ready', response: rows.find(r => r.coach_id === coachId) ?? null });
    }).catch(() => {
      if (!cancelled) setAssignment({ scope: assignmentScope, status: 'failed', response: null });
    });
    return () => { cancelled = true; };
  }, [assignmentScope, userId, myCoach?.id, roleReady, assignmentRetry]);

  // Ending an existing relationship must not restart first-time setup.
  const returningFromCoaching = profile?.id === userId && !!profile?.coach_link_ended_at;
  const skipPersonalOnboarding =
    coachingRole === 'coach' || getIntendedCoachingRole() === 'coach';
  const coachedClient =
    isCoachedAthlete(coachingRole, myCoach)
    || coachingRole === 'client';
  const needsIntakeProbe = !returningFromCoaching && !profileLoading && roleReady && intakeGateNeedsUsageProbe({
    isCoachedClient: coachedClient,
    isCoach: skipPersonalOnboarding,
    profile,
  });

  useEffect(() => {
    if (userId) {
      const existing = useProfileStore.getState().profile;
      fetchProfile(userId, { silent: existing?.id === userId });
      void (async () => {
        try {
          await applyIntendedCoachingRole();
        } finally {
          await fetchMyRole(userId);
          await fetchMyCoach();
        }
      })();
      // D07 : au login, reprend la file offline du compte (rejeu idempotent).
      useWorkoutStore.getState().refreshPendingOps();
      void useWorkoutStore.getState().syncOfflineQueue();
    } else if (initialized) {
      // Q01 : détache le push du compte qui part avant de purger le scope.
      void detachPushOnLogout(getSessionOwner());
      resetSessionStores();
    }
  }, [userId, initialized, fetchProfile, fetchMyRole, fetchMyCoach, applyIntendedCoachingRole]);

  // D07 : au retour du réseau, rejoue la file offline du compte courant.
  useEffect(() => {
    if (!userId) return;
    const onOnline = () => {
      useWorkoutStore.getState().refreshPendingOps();
      void useWorkoutStore.getState().syncOfflineQueue();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [userId]);

  // The account's language wins over this device's default (Profil → Langue is written to user_profiles).
  const profileLanguage = profile?.language;
  useEffect(() => {
    if (!profileLanguage) return;
    const wanted = profileLanguage.toLowerCase().startsWith('en') ? 'en' : 'fr';
    if (!i18n.language.toLowerCase().startsWith(wanted)) setAppLanguage(wanted);
  }, [profileLanguage]);

  useEffect(() => {
    if (!userId || !profile || profile.timezone) return;
    if (timezoneWriteFor.current === userId) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    timezoneWriteFor.current = userId;
    // D03 : écriture d'ambiance — tracée, réessayée au prochain profil si elle échoue.
    void updateProfile(userId, { timezone: tz }).then(result => {
      if (result.error) {
        console.warn('[Prometheus] timezone write failed:', result.error);
        timezoneWriteFor.current = null;
      }
    });
  }, [userId, profile, updateProfile]);

  useEffect(() => {
    if (!userId || !needsIntakeProbe) {
      setIntakeUsage(null);
      setIntakeProbeStatus('idle');
      return;
    }
    let cancelled = false;
    setIntakeProbeStatus('pending');
    void probeIntakeUsage(userId)
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
  }, [userId, needsIntakeProbe]);

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

  // Opening an invitation remembers the destination, never the user's consent.
  const pendingInvite = getPendingInviteToken();
  if (pendingInvite && !location.pathname.startsWith('/invite/')) {
    return <Navigate to={'/invite/' + encodeURIComponent(pendingInvite)} replace />;
  }
  if (location.pathname.startsWith('/invite/')) {
    return <Routes><Route path="/invite/:token" element={<InvitePage />} /></Routes>;
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

  if (assignmentScope && !activeAssignment) return <RouteFallback />;
  if (activeAssignment?.status === 'failed') {
    return <div className="p-6 space-y-4">
      <p role="alert">{t('coachQuestionnaire.loadError')}</p>
      <button type="button" onClick={() => setAssignmentRetry(n => n + 1)}>{t('errors.retry')}</button>
    </div>;
  }
  if (activeAssignment?.response && !activeAssignment.response.completed_at) {
    const responseId = activeAssignment.response.id;
    return <Suspense fallback={<RouteFallback />}><Routes>
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="*" element={<div className="p-4 max-w-2xl mx-auto">
        <ClientQuestionnairePanel key={responseId} responseId={responseId}
          onCompleted={() => setAssignmentRetry(n => n + 1)} />
      </div>} />
    </Routes></Suspense>;
  }

  if (!activeAssignment?.response && needsIntakeProbe && (intakeProbeStatus === 'idle' || intakeProbeStatus === 'pending')) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!returningFromCoaching && !activeAssignment?.response && shouldForceKinesiologyIntake({
    isCoachedClient: coachedClient,
    isCoach: skipPersonalOnboarding,
    profile,
    usage: intakeUsage,
    probeStatus: intakeProbeStatus,
  })) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="*" element={<KinesiologyIntakeFlow />} />
        </Routes>
      </Suspense>
    );
  }

  if (!profile?.onboarding_completed && !returningFromCoaching && !skipPersonalOnboarding && !deferClientOnboarding) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="*" element={<OnboardingFlow />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RouteFallback />}>
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
        <Route path="/clients/:id" element={<CoachOnly><ActiveRelationshipBoundary><ClientDetailPage /></ActiveRelationshipBoundary></CoachOnly>} />
        <Route path="/clients/:id/setup" element={<CoachOnly><ActiveRelationshipBoundary><ClientSetupPage /></ActiveRelationshipBoundary></CoachOnly>} />
        <Route path="/clients/:id/draft/:interventionId" element={<CoachOnly><InterventionDraftPage /></CoachOnly>} />
        <Route path="/inbox/:interventionId" element={<CoachOnly><InterventionDraftPage /></CoachOnly>} />
        <Route path="/messages" element={<MessagesHome />} />
        <Route path="/messages/:clientId" element={<CoachOnly><CoachInboxPage /></CoachOnly>} />
        <Route path="/photos" element={<CoachTrackerRedirect><ClientPhotosPage /></CoachTrackerRedirect>} />
        <Route path="/prometheus" element={<CoachOnly><AskPrometheusPage /></CoachOnly>} />
        <Route path="/coach/questionnaire" element={<CoachOnly><CoachQuestionnairePage key={user.id} /></CoachOnly>} />
        <Route path="/questionnaire" element={<div className="p-4 pb-28"><ClientQuestionnairePanel key={user.id}/></div>} />
        <Route path="/coach/learned" element={<CoachOnly><CoachLearnedPage /></CoachOnly>} />
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
    </Suspense>
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

