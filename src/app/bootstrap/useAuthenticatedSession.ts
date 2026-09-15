import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useCoachingStore, getPendingInviteToken, getIntendedCoachingRole, isOnboardingDeferred } from '../../stores/coachingStore';
import { resetSessionStores } from '../../lib/resetStores';
import { getSessionOwner } from '../../lib/sessionScope';
import { detachPushOnLogout } from '../../lib/notifications';
import { isCoachedAthlete } from '../../lib/coachRole';
import i18n, { setAppLanguage } from '../../i18n';
import {
  intakeGateNeedsUsageProbe,
  shouldForceKinesiologyIntake,
  type IntakeProbeStatus,
  type IntakeUsageSignals,
} from '../../lib/kinesiologyIntake';
import { probeIntakeUsage } from '../../lib/kinesiologyIntakeUsage';
import { shouldSkipKinesiologyForAssignedQuestionnaire } from '../../lib/assignedQuestionnaire';
import { useAssignedQuestionnaire } from '../../components/onboarding/assignedQuestionnaireContext';

export function useAuthenticatedSession() {
  const { user, loading: authLoading, initialized, passwordRecovery } = useAuthStore();
  const { profile, loading: profileLoading, fetchError, fetchProfile, updateProfile } = useProfileStore();
  const { roleReady, coachingRole, myCoach, fetchMyRole, fetchMyCoach, applyIntendedCoachingRole } = useCoachingStore();
  const [intakeUsage, setIntakeUsage] = useState<IntakeUsageSignals | null>(null);
  const [intakeProbeStatus, setIntakeProbeStatus] = useState<IntakeProbeStatus>('idle');
  const userId = user?.id ?? null;
  const timezoneWriteFor = useRef<string | null>(null);
  const assignedQuestionnaire = useAssignedQuestionnaire();
  const skipKineForQuestionnaire = shouldSkipKinesiologyForAssignedQuestionnaire(assignedQuestionnaire);

  const skipPersonalOnboarding =
    coachingRole === 'coach'
    || getIntendedCoachingRole() === 'coach'
    || profile?.entry_intent === 'find_coach';
  const coachedClient =
    isCoachedAthlete(coachingRole, myCoach)
    || coachingRole === 'client';
  // Ending an existing relationship must not restart first-time setup.
  const returningFromCoaching = profile?.id === userId && !!profile?.coach_link_ended_at;
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
          // Consent is explicit on /invite/:token. Never auto-accept after login.
          if (!getPendingInviteToken()) {
            await applyIntendedCoachingRole();
          }
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

  const deferClientOnboarding =
    coachedClient
    || (isOnboardingDeferred() && !!myCoach);

  const forceKinesiology = shouldForceKinesiologyIntake({
    isCoachedClient: coachedClient,
    isCoach: skipPersonalOnboarding,
    profile,
    usage: intakeUsage,
    probeStatus: intakeProbeStatus,
  });

  return {
    user,
    userId,
    authLoading,
    initialized,
    passwordRecovery,
    profile,
    profileLoading,
    fetchError,
    fetchProfile,
    roleReady,
    myCoach,
    intakeProbeStatus,
    skipKineForQuestionnaire,
    skipPersonalOnboarding,
    coachedClient,
    returningFromCoaching,
    needsIntakeProbe,
    deferClientOnboarding,
    forceKinesiology,
    pendingInvite: getPendingInviteToken(),
  };
}
