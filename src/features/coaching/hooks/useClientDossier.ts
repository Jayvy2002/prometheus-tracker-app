import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { useCoachingStore } from '../../../stores/coachingStore';
import { useProgramStore } from '../../../stores/programStore';
import { todayStr, addDaysToDateStr } from '../../../lib/utils';
import { ALL_ON_TRACKING, parseResolvedTracking, type ResolvedTrackingConfig } from '../../../lib/clientTracking';
import type {
  ClientLiftProgress,
  DailyCheckin,
  DailyNutritionPoint,
  ProgressPhoto,
  ProgramAssignment,
  UserProfile,
  WeightMeasurement,
  Workout,
} from '../../../lib/types';

/** Fetch + realtime du dossier 360. L’écran garde le JSX. */
export function useClientDossier(id: string | undefined) {
  const { user } = useAuthStore();
  const {
    clients, fetchClients, fetchClientWorkouts,
    fetchClientWeight, fetchClientCheckins, fetchClientProfile, fetchTrackingConfig,
    fetchClientNutritionRange, fetchClientLiftHistory, fetchProgressPhotos, signProgressPhotoUrls,
    fetchNotes, opsRows, fetchCoachOps,
    touchClientVisit, fetchCoachSettings,
    subscribeClientDossier, fetchClientAssignments,
  } = useCoachingStore();
  const { fetchMyAssignment } = useProgramStore();

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [weights, setWeights] = useState<WeightMeasurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [visitAnchor, setVisitAnchor] = useState<string | null | undefined>(undefined);
  const [nutritionDays, setNutritionDays] = useState<DailyNutritionPoint[]>([]);
  const [progressLifts, setProgressLifts] = useState<ClientLiftProgress[] | null>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [clientProfile, setClientProfile] = useState<UserProfile | null>(null);
  const [boundAssignment, setBoundAssignment] = useState<ProgramAssignment | null>(null);
  /** C01 : fraîcheur du dossier + échec distingué d'une absence de données. */
  const [dossierFetchedAt, setDossierFetchedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const loadSeq = useRef(0);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** C04 : historique des attributions (actives + en pause) + adoption. */
  const [assignmentHistory, setAssignmentHistory] = useState<Array<ProgramAssignment & { programs?: { name: string } | null }>>([]);
  const [tracking, setTracking] = useState<ResolvedTrackingConfig>({
    ...ALL_ON_TRACKING,
    training: { ...ALL_ON_TRACKING.training },
    nutrition: { ...ALL_ON_TRACKING.nutrition },
    checkin: { ...ALL_ON_TRACKING.checkin },
  });

  const client = clients.find(c => c.id === id);
  const ops = opsRows.find(r => r.client.id === id);

  const loadDossier = useCallback(async (loadId: string, opts?: { silent?: boolean }) => {
    const seq = ++loadSeq.current;
    if (!opts?.silent) setLoading(true);
    setLoadError(false);
    const start = addDaysToDateStr(todayStr(), -27);
    const settled = await Promise.allSettled([
      user ? fetchMyAssignment(loadId) : Promise.resolve(null),
      fetchClientWorkouts(loadId),
      fetchClientCheckins(loadId),
      fetchClientWeight(loadId),
      fetchNotes(loadId),
      fetchClientProfile(loadId).then(async profile => {
        const target = profile?.daily_calorie_target ?? 0;
        const days = await fetchClientNutritionRange(loadId, start, todayStr(), target);
        return { profile, days };
      }),
      fetchTrackingConfig(loadId),
      fetchClientLiftHistory(loadId),
      fetchProgressPhotos(loadId).then(async rows => ({
        rows,
        urls: await signProgressPhotoUrls(rows),
      })),
      fetchClientAssignments(loadId),
    ]);
    if (seq !== loadSeq.current) return;
    const value = <T,>(i: number, fallback: T): T => {
      const s = settled[i];
      return s.status === 'fulfilled' ? (s.value as T) : fallback;
    };
    setBoundAssignment(value(0, null));
    setWorkouts(value(1, []));
    setCheckins(value(2, []));
    setWeights(value(3, []));
    const nutrition = value<{ profile: UserProfile | null; days: DailyNutritionPoint[] }>(5, { profile: null, days: [] });
    setClientProfile(nutrition.profile);
    setNutritionDays(nutrition.days);
    const cfg = value(6, null);
    if (cfg) setTracking(parseResolvedTracking(cfg));
    setProgressLifts(value(7, null));
    const photoPack = value<{ rows: ProgressPhoto[]; urls: Record<string, string> }>(8, { rows: [], urls: {} });
    setPhotos(photoPack.rows);
    setPhotoUrls(photoPack.urls);
    setAssignmentHistory(value(9, []));
    if (settled.some(s => s.status === 'rejected')) setLoadError(true);
    setDossierFetchedAt(new Date().toISOString());
    if (!opts?.silent) setLoading(false);
  }, [user, fetchMyAssignment, fetchClientWorkouts, fetchClientCheckins, fetchClientWeight, fetchNotes, fetchClientProfile, fetchClientNutritionRange, fetchTrackingConfig, fetchClientLiftHistory, fetchProgressPhotos, signProgressPhotoUrls, fetchClientAssignments]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const previous = useCoachingStore.getState().opsRows.find(r => r.client.id === id)?.client.last_visited_at
      ?? useCoachingStore.getState().clients.find(c => c.id === id)?.last_visited_at
      ?? null;
    setVisitAnchor(previous);
    if (!clients.length) fetchClients();
    if (!opsRows.length) fetchCoachOps();
    touchClientVisit(id);
    fetchCoachSettings();
    setLoading(true);
    setLoadError(false);
    setDossierFetchedAt(null);
    setBoundAssignment(null);
    setWorkouts([]);
    setCheckins([]);
    setWeights([]);
    setNutritionDays([]);
    setProgressLifts(null);
    setPhotos([]);
    setPhotoUrls({});
    setClientProfile(null);
    setAssignmentHistory([]);
    void loadDossier(id);
    // C01 : le Realtime invalide (relecture serveur), jamais l'unique voie.
    const unsubscribe = subscribeClientDossier(id, () => {
      if (cancelled) return;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        if (!cancelled) void loadDossier(id, { silent: true });
      }, 1500);
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) void loadDossier(id, { silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    const onOnline = () => {
      if (!cancelled) void loadDossier(id, { silent: true });
    };
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    client,
    ops,
    workouts,
    checkins,
    weights,
    loading,
    visitAnchor,
    nutritionDays,
    progressLifts,
    photos,
    photoUrls,
    clientProfile,
    boundAssignment,
    dossierFetchedAt,
    loadError,
    assignmentHistory,
    tracking,
    loadDossier,
    setAssignmentHistory,
    setTracking,
    setClientProfile,
  };
}
