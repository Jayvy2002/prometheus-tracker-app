import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useAccountContext } from '../../lib/useAccountContext';
import ActiveRelationshipBoundary from '../../components/coaching/ActiveRelationshipBoundary';
import CoachMessageAccess from '../../components/coaching/CoachMessageAccess';
import TrackingGate from '../../components/coaching/TrackingGate';
import AppLayout from '../../components/layout/AppLayout';
import AuthPage from '../../components/auth/AuthPage';
import ResetPasswordPage from '../../components/auth/ResetPasswordPage';
import InvitePage from '../../components/coaching/InvitePage';
import { useAssignedQuestionnaire } from '../../components/onboarding/assignedQuestionnaireContext';
import Dashboard from '../../components/dashboard/Dashboard';
import { useAuthenticatedSession } from '../bootstrap/useAuthenticatedSession';
import {
  CoachOnly,
  CoachTrackerRedirect,
  CoachedAthleteRedirect,
  RouteFallback,
} from '../guards/RouteGuards';

// Q05 : routes en lazy — le bundle initial ne porte que l'auth + le shell.
const OnboardingFlow = lazy(() => import('../../components/onboarding/OnboardingFlow'));
const KinesiologyIntakeFlow = lazy(() => import('../../components/onboarding/KinesiologyIntakeFlow'));
const EntryIntentionPage = lazy(() => import('../../components/onboarding/EntryIntentionPage'));
const WorkoutPage = lazy(() => import('../../components/workout/WorkoutPage'));
const WorkoutForm = lazy(() => import('../../components/workout/WorkoutForm'));
const ExerciseProgressPage = lazy(() => import('../../components/workout/ExerciseProgressPage'));
const StatsPage = lazy(() => import('../../components/stats/StatsPage'));
const RoutinesPage = lazy(() => import('../../components/routines/RoutinesPage'));
const WeightPage = lazy(() => import('../../components/weight/WeightPage'));
const NutritionPage = lazy(() => import('../../components/nutrition/NutritionPage'));
const ScannerPage = lazy(() => import('../../components/scanner/ScannerPage'));
const ProfilePage = lazy(() => import('../../components/profile/ProfilePage'));
const CalendarPage = lazy(() => import('../../components/calendar/CalendarPage'));
const RecipesPage = lazy(() => import('../../components/nutrition/RecipesPage'));
const CheckInPage = lazy(() => import('../../components/checkin/CheckInPage'));
const ClientsPage = lazy(() => import('../../components/coaching/ClientsPage'));
const ClientDetailPage = lazy(() => import('../../components/coaching/ClientDetailPage'));
const ClientSetupPage = lazy(() => import('../../components/coaching/ClientSetupPage'));
const InterventionDraftPage = lazy(() => import('../../components/coaching/InterventionDraftPage'));
const CoachDashboard = lazy(() => import('../../components/coaching/CoachDashboard'));
const ProgramsPage = lazy(() => import('../../components/programs/ProgramsPage'));
const ProgramEditorPage = lazy(() => import('../../components/programs/ProgramEditorPage'));
const ClientProgramPage = lazy(() => import('../../components/programs/ClientProgramPage'));
const AskPrometheusPage = lazy(() => import('../../components/coaching/AskPrometheusPage'));
const CoachInboxPage = lazy(() => import('../../components/coaching/CoachInboxPage'));
const ClientMessagesPage = lazy(() => import('../../components/coaching/ClientMessagesPage'));
const ClientPhotosPage = lazy(() => import('../../components/coaching/ClientPhotosPage'));
const CoachQuestionnairePage = lazy(() => import('../../components/coaching/CoachQuestionnairePage'));
const ClientQuestionnairePanel = lazy(() => import('../../components/onboarding/ClientQuestionnairePanel'));
const CoachLearnedPage = lazy(() => import('../../components/coaching/CoachLearnedPage'));
const MarketplacePage = lazy(() => import('../../components/marketplace/MarketplacePage'));
const CoachComparisonPage = lazy(() => import('../../components/marketplace/CoachComparisonPage'));
const CoachMatchPage = lazy(() => import('../../components/marketplace/CoachMatchPage'));

function HomeDashboard() {
  const context = useAccountContext();
  if (!context.ready) return <RouteFallback />;
  return context.activeWorkspace === 'coaching' ? <CoachDashboard /> : <Dashboard />;
}

function MessagesHome() {
  const context = useAccountContext();
  if (!context.ready) return <RouteFallback />;
  return context.activeWorkspace === 'coaching' ? <CoachInboxPage /> : <ClientMessagesPage />;
}

function ProgramsHome() {
  const context = useAccountContext();
  if (!context.ready) return <RouteFallback />;
  if (context.activeWorkspace === 'coaching') return <ProgramsPage />;
  return <ClientProgramPage />;
}

function AthleteQuestionnairePage() {
  const { user } = useAuthStore();
  const { retry } = useAssignedQuestionnaire();
  return (
    <div className="p-4 pb-28">
      <ClientQuestionnairePanel key={user?.id} onCompleted={retry} />
    </div>
  );
}

export default function AppRoutes() {
  const { t } = useTranslation();
  const location = useLocation();
  const session = useAuthenticatedSession();
  const {
    user,
    authLoading,
    initialized,
    passwordRecovery,
    profile,
    profileLoading,
    fetchError,
    fetchProfile,
    roleReady,
    intakeProbeStatus,
    skipKineForQuestionnaire,
    skipPersonalOnboarding,
    coachedClient,
    returningFromCoaching,
    needsIntakeProbe,
    deferClientOnboarding,
    forceKinesiology,
    pendingInvite,
  } = session;

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

  if (pendingInvite && !location.pathname.startsWith('/invite/')) {
    return <Navigate to={`/invite/${pendingInvite}`} replace />;
  }

  if (location.pathname.startsWith('/invite/')) {
    return (
      <Routes>
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
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

  if (
    profile
    && 'entry_intent' in profile
    && !profile.entry_intent
    && !returningFromCoaching
    && !coachedClient
    && !pendingInvite
  ) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <EntryIntentionPage key={user.id} />
      </Suspense>
    );
  }

  if (
    location.pathname === '/coaches'
    || location.pathname.startsWith('/coaches/')
    || location.pathname === '/coach/profile'
    || location.pathname === '/coaching-requests'
  ) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/coaches" element={<MarketplacePage key={user.id + ':directory'} mode="directory" />} />
            <Route path="/coaches/match" element={<CoachMatchPage key={user.id + ':match'} />} />
            <Route path="/coaches/compare" element={<CoachComparisonPage key={user.id} />} />
            <Route path="/coaches/:coachId" element={<MarketplacePage key={user.id + location.pathname} mode="detail" />} />
            <Route path="/coach/profile" element={<CoachOnly><MarketplacePage key={user.id + ':profile'} mode="profile" /></CoachOnly>} />
            <Route path="/coaching-requests" element={<MarketplacePage key={user.id + ':requests'} mode="requests" />} />
          </Route>
        </Routes>
      </Suspense>
    );
  }

  if (!skipKineForQuestionnaire && needsIntakeProbe && (intakeProbeStatus === 'idle' || intakeProbeStatus === 'pending')) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!skipKineForQuestionnaire && forceKinesiology) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="*" element={<KinesiologyIntakeFlow />} />
        </Routes>
      </Suspense>
    );
  }

  if (!profile?.onboarding_completed && !skipPersonalOnboarding && !deferClientOnboarding && !returningFromCoaching) {
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
        <Route path="/calendar" element={<CoachTrackerRedirect><CalendarPage /></CoachTrackerRedirect>} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/exercise-progress" element={<CoachTrackerRedirect><ExerciseProgressPage /></CoachTrackerRedirect>} />
        <Route path="/stats" element={<CoachTrackerRedirect><StatsPage /></CoachTrackerRedirect>} />
        <Route path="/checkin" element={<CoachTrackerRedirect><TrackingGate module="checkins"><CheckInPage /></TrackingGate></CoachTrackerRedirect>} />
        <Route path="/clients" element={<CoachOnly><ClientsPage /></CoachOnly>} />
        <Route path="/clients/:id" element={<CoachOnly><ActiveRelationshipBoundary><ClientDetailPage /></ActiveRelationshipBoundary></CoachOnly>} />
        <Route path="/clients/:id/setup" element={<CoachOnly><ActiveRelationshipBoundary><ClientSetupPage /></ActiveRelationshipBoundary></CoachOnly>} />
        <Route path="/clients/:id/draft/:interventionId" element={<CoachOnly><ActiveRelationshipBoundary><InterventionDraftPage /></ActiveRelationshipBoundary></CoachOnly>} />
        <Route path="/inbox/:interventionId" element={<CoachOnly><InterventionDraftPage /></CoachOnly>} />
        <Route path="/messages" element={<MessagesHome />} />
        <Route path="/messages/:clientId" element={<CoachOnly><CoachMessageAccess><CoachInboxPage /></CoachMessageAccess></CoachOnly>} />
        <Route path="/photos" element={<CoachTrackerRedirect><ClientPhotosPage /></CoachTrackerRedirect>} />
        <Route path="/prometheus" element={<CoachOnly><AskPrometheusPage /></CoachOnly>} />
        <Route path="/coach/questionnaire" element={<CoachOnly><CoachQuestionnairePage key={user.id} /></CoachOnly>} />
        <Route path="/questionnaire" element={<AthleteQuestionnairePage key={user.id} />} />
        <Route path="/coach/learned" element={<CoachOnly><CoachLearnedPage /></CoachOnly>} />
        <Route path="/programs" element={<ProgramsHome />} />
        <Route path="/programs/new" element={<CoachOnly><ProgramEditorPage /></CoachOnly>} />
        <Route path="/programs/:id" element={<CoachOnly><ProgramEditorPage /></CoachOnly>} />
        <Route path="/recipes" element={<CoachTrackerRedirect><TrackingGate module="nutrition"><RecipesPage /></TrackingGate></CoachTrackerRedirect>} />
      </Route>
      <Route path="/workout/new" element={<CoachTrackerRedirect><TrackingGate module="workouts"><WorkoutForm /></TrackingGate></CoachTrackerRedirect>} />
      <Route path="/workout/:id" element={<CoachTrackerRedirect><TrackingGate module="workouts"><WorkoutForm /></TrackingGate></CoachTrackerRedirect>} />
      <Route path="/routines" element={<AppLayout />}>
        <Route index element={<CoachTrackerRedirect><CoachedAthleteRedirect><RoutinesPage /></CoachedAthleteRedirect></CoachTrackerRedirect>} />
      </Route>
      <Route path="/scanner" element={<CoachTrackerRedirect><TrackingGate module="nutrition"><ScannerPage /></TrackingGate></CoachTrackerRedirect>} />
      <Route path="/intake" element={<KinesiologyIntakeFlow allowExit />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </Suspense>
  );
}
