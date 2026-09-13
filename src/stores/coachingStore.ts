import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type {
  ClientOpsRow,
  ClientTrackingConfig,
  CoachingRole,
  CoachClientSummary,
  CoachCommandStats,
  CoachIntervention,
  CoachInterventionKind,
  CoachInterventionStatus,
  CoachInvite,
  ClientLiftProgress,
  CoachMessage,
  CoachNote,
  CoachNudgeTemplateKey,
  CoachPreview,
  CoachPriority,
  CoachRosterSignals,
  CoachSettings,
  DailyCheckin,
  DailyNutritionPoint,
  NutritionLog,
  ProgramAssignment,
  ProgressPhoto,
  ProgressPhotoKind,
  UserProfile,
  WaterLog,
  WeightMeasurement,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../lib/types';
import { mapInterventionRow, type ProgramOutlineDraft } from '../lib/coachInterventions';
import { functionsErrorBody, functionsHttpStatus } from '../lib/supabaseFunctions';
import {
  COACH_REALTIME_POLL_MS,
  isInterventionDrafting,
  mergeInterventionRealtime,
  type SecondPingKind,
} from '../lib/coachSecond';
import { COACH_AGENT_FUNCTION, parseCoachAgentResponse } from '../lib/coachAgent';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { mapCoachMessage } from '../lib/coachQueue';
import {
  liveMessageState,
  nutritionTargetsFromProfileRow,
  shouldRefreshClientAssignment,
  shouldRefreshClientProgramContent,
  shouldRefreshProgressPhotos,
} from '../lib/clientLive';
import { EMPTY_COACH_SETTINGS, mapCoachSettings } from '../lib/coachSettings';
import { aggregateNutritionByDay } from '../lib/coachProgress';
import {
  ALL_OFF_TRACKING,
  ALL_ON_TRACKING,
  parseResolvedTracking,
  resolveViewerTracking,
  serializeTrackingVars,
  type ResolvedTrackingConfig,
} from '../lib/clientTracking';
import { isCoachedAthlete } from '../lib/coachRole';
import { profileHasMedicalFlags } from '../lib/kinesiologyIntake';
import { profileLinkEndedChanged } from '../lib/soloTransition';
import { track } from '../lib/telemetryClient';
import {
  cloneTracking,
  nextRoleAfterFetch,
  opsHasPartialError,
  parseRememberedCoachingRole,
  previousRoleForFetch,
  viewerTrackingAfterFetch,
} from '../lib/coachStoreGuards';
import i18n from '../i18n';
import { toast } from '../components/ui/Toast';
import type { ClientVisibleProfilePatch } from '../lib/coachClientProfile';
import { loadOrCreateInterventionKeys } from '../lib/idempotencyKeys';
import { effectsToJson } from '../lib/interventionEffects';
import { useProfileStore } from './profileStore';
import { useProgramStore } from './programStore';
import { buildClientOpsRows, coachClockFacts, datePrefix, weekAgoStr } from '../lib/coachAlerts';
import { buildClientLifts } from '../lib/coachLifts';
import { buildCoachPriorities, commandStats } from '../lib/coachPriorities';
import { addDaysToDateStr, todayStr } from '../lib/utils';
import { compareRosterName } from '../lib/coachRoster';
import { fetchAllRows } from '../lib/postgrestPage';
import { getSessionOwner } from '../lib/sessionScope';
import { directInviteConsentArgs } from '../lib/relationshipConsent';
import {
  loadAccountWorkspace,
  persistAccountWorkspace,
  readAccountRole,
  type AccountSnapshot,
  type AccountWorkspace,
} from '../lib/accountContext';

let endMyCoachLinkInFlight = false;
let acceptInviteInFlight = false;

const PENDING_INVITE_KEY = 'prometheus_pending_invite';
const INTENDED_ROLE_KEY = 'prometheus_intended_coaching_role';
const LAST_ROLE_KEY = 'prometheus_last_coaching_role';

function lastRoleStorageKey(userId: string) {
  return `${LAST_ROLE_KEY}:${userId}`;
}

function loadRememberedCoachingRole(userId: string): CoachingRole | null {
  try {
    return parseRememberedCoachingRole(localStorage.getItem(lastRoleStorageKey(userId)));
  } catch {
    return null;
  }
}

function persistRememberedCoachingRole(userId: string, role: CoachingRole) {
  try {
    localStorage.setItem(lastRoleStorageKey(userId), role);
  } catch {
    // private mode / quota
  }
}

export type IntendedCoachingRole = Extract<CoachingRole, 'coach' | 'client'>;

export function setPendingInviteToken(token: string) {
  try { localStorage.setItem(PENDING_INVITE_KEY, token); } catch { /* private mode */ }
  try { sessionStorage.setItem(PENDING_INVITE_KEY, token); } catch { /* private mode */ }
}

export function getPendingInviteToken(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE_KEY) || sessionStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInviteToken() {
  try { localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
}

export function setIntendedCoachingRole(role: IntendedCoachingRole) {
  try {
    localStorage.setItem(INTENDED_ROLE_KEY, role);
  } catch {
    // private mode / quota
  }
}

export function getIntendedCoachingRole(): IntendedCoachingRole | null {
  try {
    const value = localStorage.getItem(INTENDED_ROLE_KEY);
    return value === 'coach' || value === 'client' ? value : null;
  } catch {
    return null;
  }
}

export function clearIntendedCoachingRole() {
  try {
    localStorage.removeItem(INTENDED_ROLE_KEY);
  } catch {
    // ignore
  }
}

const DEFER_ONBOARDING_KEY = 'prometheus_defer_onboarding';

export function setOnboardingDeferred() {
  try {
    sessionStorage.setItem(DEFER_ONBOARDING_KEY, '1');
  } catch {
    // private mode / quota
  }
}

export function clearOnboardingDeferred() {
  try {
    sessionStorage.removeItem(DEFER_ONBOARDING_KEY);
  } catch {
    // ignore
  }
}

export function isOnboardingDeferred(): boolean {
  try {
    return sessionStorage.getItem(DEFER_ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}

const EMPTY_SIGNALS: CoachRosterSignals = {
  checkins: [],
  weights: [],
  lifts: [],
  nutritionLogs: [],
  calorieTargets: {},
  lastNoteAt: {},
  lastInterventionAt: {},
  assignmentStart: {},
  assignmentWeeks: {},
  assignmentName: {},
  scheduledDays: {},
};

const EMPTY_STATS: CoachCommandStats = {
  activeClients: 0,
  needAttention: 0,
  checkinsToReview: 0,
  programsMayAdapt: 0,
  important: 0,
};

function queueDoneKey(day = todayStr()) {
  return `prometheus_queue_done_${day}`;
}

function loadQueueDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(queueDoneKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveQueueDismissed(ids: string[]) {
  try {
    sessionStorage.setItem(queueDoneKey(), JSON.stringify(ids));
  } catch {
    // private mode / quota
  }
}

function omitRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

function dropUnlinkedClient(s: {
  clients: CoachClientSummary[];
  opsRows: ClientOpsRow[];
  priorities: CoachPriority[];
  pendingInterventions: CoachIntervention[];
  sentMessages: CoachMessage[];
  notes: CoachNote[];
  unreadMessageCount: number;
  rosterSignals: CoachRosterSignals;
}, clientId: string) {
  const clients = s.clients.filter(c => c.id !== clientId);
  const opsRows = s.opsRows.filter(r => r.client.id !== clientId);
  const priorities = s.priorities.filter(p => p.clientId !== clientId);
  const pendingInterventions = s.pendingInterventions.filter(r => r.client_id !== clientId);
  const sentMessages = s.sentMessages.filter(m => m.client_id !== clientId);
  const notes = s.notes.filter(n => n.client_id !== clientId);
  const removedUnread = s.sentMessages.filter(
    m => m.client_id === clientId && m.sender_id !== m.coach_id && !m.read_at,
  ).length;
  const signals = s.rosterSignals;
  const rosterSignals: CoachRosterSignals = {
    checkins: signals.checkins.filter(c => c.user_id !== clientId),
    weights: signals.weights.filter(w => w.user_id !== clientId),
    lifts: signals.lifts.filter(l => l.clientId !== clientId),
    nutritionLogs: signals.nutritionLogs.filter(l => l.user_id !== clientId),
    calorieTargets: omitRecordKey(signals.calorieTargets, clientId),
    lastNoteAt: omitRecordKey(signals.lastNoteAt, clientId),
    lastInterventionAt: omitRecordKey(signals.lastInterventionAt, clientId),
    assignmentStart: omitRecordKey(signals.assignmentStart, clientId),
    assignmentWeeks: omitRecordKey(signals.assignmentWeeks, clientId),
    assignmentName: omitRecordKey(signals.assignmentName, clientId),
    scheduledDays: omitRecordKey(signals.scheduledDays, clientId),
  };
  return {
    clients,
    opsRows,
    priorities,
    pendingInterventions,
    sentMessages,
    notes,
    unreadMessageCount: Math.max(0, s.unreadMessageCount - removedUnread),
    rosterSignals,
    commandStats: commandStats(opsRows, priorities, rosterSignals),
  };
}

let coachRealtimeChannel: RealtimeChannel | null = null;
let coachPollTimer: ReturnType<typeof setInterval> | null = null;
let clientRealtimeChannel: RealtimeChannel | null = null;
/** C01 : un canal par fiche 360 ouverte (observations du client affiché). */
const dossierChannels = new Map<string, RealtimeChannel>();

interface CoachingState {
  coachingRole: CoachingRole;
  roleReady: boolean;
  coachingRoleError: string | null;
  accountSnapshot: AccountSnapshot | null;
  accountWorkspace: AccountWorkspace;
  loading: boolean;
  clients: CoachClientSummary[];
  clientsFetchError: string | null;
  invites: CoachInvite[];
  myCoach: CoachPreview | null;
  notes: CoachNote[];
  opsRows: ClientOpsRow[];
  opsLoading: boolean;
  opsPartialError: string | null;
  pendingInterventions: CoachIntervention[];
  sentMessages: CoachMessage[];
  latestCoachMessage: CoachMessage | null;
  unreadMessageCount: number;
  /** C02 : fils épuisés (plus rien à charger) par client_id. */
  threadExhausted: Record<string, boolean>;
  coachSettings: CoachSettings | null;
  myTrackingConfig: ResolvedTrackingConfig;
  trackingReady: boolean;
  queueDismissedIds: string[];
  priorities: CoachPriority[];
  rosterSignals: CoachRosterSignals;
  commandStats: CoachCommandStats;
  fleetRunning: boolean;
  lastFleetRound: {
    clients_seen: number;
    clients_flagged: number;
    clients_skipped: number;
    model_used: string | null;
  } | null;
  progressPhotosEpoch: number;
  fetchMyRole: (userId: string) => Promise<void>;
  selectAccountWorkspace: (workspace: AccountWorkspace) => void;
  setCoachingRole: (role: CoachingRole) => Promise<{ error: string | null }>;
  applyIntendedCoachingRole: () => Promise<void>;
  enableCoachMode: () => Promise<{ error: string | null }>;
  disableCoachMode: () => Promise<{ error: string | null }>;
  fetchClients: () => Promise<void>;
  fetchCoachOps: () => Promise<void>;
  fetchClientProfile: (clientId: string) => Promise<UserProfile | null>;
  fetchTrackingConfig: (clientId: string) => Promise<ClientTrackingConfig | null>;
  fetchMyTrackingConfig: () => Promise<void>;
  saveTrackingConfig: (
    clientId: string,
    data: Partial<ResolvedTrackingConfig> & Partial<Pick<ClientTrackingConfig, 'setup_completed_at'>>,
  ) => Promise<{ error: string | null }>;
  setClientNutritionTargets: (
    clientId: string,
    targets: { calories: number; protein: number; carbs: number; fat: number },
  ) => Promise<{ error: string | null }>;
  setClientVisibleProfile: (
    clientId: string,
    patch: ClientVisibleProfilePatch,
  ) => Promise<{ error: string | null }>;
  applyProgramOutline: (clientId: string, outline: ProgramOutlineDraft) => Promise<{ error: string | null }>;
  fetchPendingInterventions: () => Promise<void>;
  fetchCoachMessages: () => Promise<void>;
  sendCoachMessage: (
    clientId: string,
    body: string,
    templateKey: CoachNudgeTemplateKey,
    clientMsgId?: string,
  ) => Promise<{ error: string | null }>;
  sendClientReply: (body: string, clientMsgId?: string) => Promise<{ error: string | null }>;
  /**
   * C02 : pagination par conversation (curseur created_at DESC). Complète
   * sentMessages sans le tronquer ; hasMore[clientId]=false en fin de fil.
   */
  fetchThreadPage: (clientId: string) => Promise<void>;
  fetchUnreadCounts: () => Promise<void>;
  markCoachMessageRead: (id: string) => Promise<void>;
  markThreadRead: (clientId: string) => Promise<void>;
  fetchCoachSettings: () => Promise<void>;
  saveCoachSettings: (patch: Partial<Pick<CoachSettings, 'visible_tabs' | 'nudge_templates' | 'default_tracking' | 'timezone' | 'missed_workout_cutoff_hour'>>) => Promise<{ error: string | null }>;
  fetchClientNutritionRange: (clientId: string, start: string, end: string, calorieTarget: number) => Promise<DailyNutritionPoint[]>;
  fetchClientLiftHistory: (clientId: string) => Promise<ClientLiftProgress[]>;
  fetchProgressPhotos: (userId: string) => Promise<ProgressPhoto[]>;
  uploadProgressPhoto: (input: {
    file: File;
    takenAt: string;
    kind: ProgressPhotoKind;
    notes?: string;
  }) => Promise<{ photo: ProgressPhoto } | { error: string }>;
  deleteProgressPhoto: (id: string, storagePath: string) => Promise<{ error: string | null }>;
  signProgressPhotoUrls: (photos: ProgressPhoto[]) => Promise<Record<string, string>>;
  dismissQueueItem: (id: string) => void;
  dismissQueueItems: (ids: string[]) => void;
  fetchIntervention: (id: string) => Promise<CoachIntervention | null>;
  fetchOnboardingPlanDraft: (clientId: string) => Promise<CoachIntervention | null>;
  resolveIntervention: (
    id: string,
    status: Extract<CoachInterventionStatus, 'sent' | 'dismissed' | 'kept'>,
    payload?: Record<string, unknown>,
  ) => Promise<{ error: string | null }>;
  /**
   * D02 : une commande serveur applique les effets et fige la décision.
   * Les clés d'idempotence (claim, idempotency, client_msg_id) survivent
   * aux retries et au reload.
   */
  applyIntervention: (
    id: string | null,
    status: Extract<CoachInterventionStatus, 'sent' | 'dismissed' | 'kept'>,
    payload: Record<string, unknown> | undefined,
    effects: import('../lib/interventionEffects').InterventionEffects,
  ) => Promise<{ error: string | null; replayed?: boolean }>;
  /**
   * D02 : claim atomique avant d'appliquer des effets. Une seule validation
   * gagne ; l'autre onglet reçoit already_resolved / already_claimed AVANT
   * tout effet. Toujours suivre de finalize (succès) ou release (échec).
   */
  claimIntervention: (id: string) => Promise<{ claimKey: string } | { error: string }>;
  releaseIntervention: (id: string, claimKey: string) => Promise<void>;
  finalizeIntervention: (
    id: string,
    claimKey: string,
    status: Extract<CoachInterventionStatus, 'sent' | 'dismissed' | 'kept'>,
    payload?: Record<string, unknown>,
  ) => Promise<{ error: string | null }>;
  askCoachAgent: (input: {
    kind: SecondPingKind;
    clientId?: string | null;
    programId?: string | null;
    prompt: string;
    screen: string;
    context?: Record<string, unknown>;
  }) => Promise<{ id: string } | { error: string }>;
  runFleetRound: () => Promise<{
    error: string | null;
    clients_seen?: number;
    clients_flagged?: number;
    clients_skipped?: number;
    model_used?: string | null;
  }>;
  startCoachRealtime: () => Promise<void>;
  stopCoachRealtime: () => void;
  startClientRealtime: () => Promise<void>;
  stopClientRealtime: () => void;
  /**
   * C01 : observe les tables d'observation d'UN client (fiche 360 ouverte).
   * Le Realtime ne fait qu'invalider — l'appelant recharge depuis le serveur.
   * Retourne la fonction de désabonnement.
   */
  subscribeClientDossier: (clientId: string, onInvalidate: () => void) => () => void;
  /** C04 : attributions (actives + en pause) d'un client suivi. */
  fetchClientAssignments: (clientId: string) => Promise<Array<ProgramAssignment & { programs?: { name: string } | null }>>;
  /** C04 : adopte (fork) un programme assigné au client dans la bibliothèque coach. */
  adoptClientProgram: (programId: string, clientId: string) => Promise<{ programId: string } | { error: string }>;
  createIntervention: (input: {
    clientId: string | null;
    kind: CoachInterventionKind;
    title: string;
    rationale: string;
    payload: Record<string, unknown>;
    source?: string;
  }) => Promise<{ id: string } | { error: string }>;
  touchClientVisit: (clientId: string) => Promise<void>;
  fetchInvites: () => Promise<void>;
  createInvite: (opts?: { days?: number; maxUses?: number }) => Promise<{ token: string } | { error: string }>;
  revokeInvite: (id: string) => Promise<void>;
  fetchMyCoach: () => Promise<void>;
  acceptInvite: (token: string) => Promise<{ ok: boolean; error?: string; coach_name?: string }>;
  previewInvite: (token: string) => Promise<{ valid: boolean; coach_name: string | null; error?: string }>;
  fetchClientWorkouts: (clientId: string) => Promise<Workout[]>;
  fetchClientWorkout: (workoutId: string) => Promise<Workout | null>;
  fetchClientNutrition: (clientId: string, date: string) => Promise<{ logs: NutritionLog[]; water: WaterLog[] }>;
  fetchClientWeight: (clientId: string) => Promise<WeightMeasurement[]>;
  fetchClientCheckins: (clientId: string) => Promise<DailyCheckin[]>;
  fetchNotes: (clientId: string) => Promise<void>;
  addNote: (clientId: string, body: string, opts?: { noteDate?: string; workoutId?: string }) => Promise<{ error: string | null }>;
  deleteNote: (id: string) => Promise<void>;
  endMyCoachLink: () => Promise<{ error: string | null }>;
  endClientLink: (linkClientId: string) => Promise<{ error: string | null }>;
  clear: () => void;
}

export const useCoachingStore = create<CoachingState>((set, get) => ({
  coachingRole: 'none',
  roleReady: false,
  coachingRoleError: null,
  accountSnapshot: null,
  accountWorkspace: 'personal',
  loading: false,
  clients: [],
  clientsFetchError: null,
  invites: [],
  myCoach: null,
  notes: [],
  opsRows: [],
  opsLoading: false,
  opsPartialError: null,
  pendingInterventions: [],
  sentMessages: [],
  latestCoachMessage: null,
  unreadMessageCount: 0,
  threadExhausted: {},
  coachSettings: null,
  myTrackingConfig: cloneTracking(ALL_ON_TRACKING),
  trackingReady: false,
  queueDismissedIds: loadQueueDismissed(),
  priorities: [],
  rosterSignals: EMPTY_SIGNALS,
  commandStats: EMPTY_STATS,
  fleetRunning: false,
  lastFleetRound: null,
  progressPhotosEpoch: 0,

  fetchMyRole: async (userId) => {
    const previous = previousRoleForFetch(get().coachingRole, loadRememberedCoachingRole(userId));
    try {
      const { data, error, snapshot } = await readAccountRole(
        userId,
        () => supabase.rpc('get_my_account_context'),
        () => supabase.from('user_roles').select('coaching_role').eq('user_id', userId).maybeSingle(),
      );
      const outcome = nextRoleAfterFetch({
        previous,
        data: data as { coaching_role?: string | null } | null,
        error: error ? { message: error.message } : null,
      });
      if (outcome.error) {
        set({
          coachingRole: outcome.role,
          accountSnapshot: null,
          accountWorkspace: 'personal',
          coachingRoleError: outcome.error,
          roleReady: true,
        });
        toast(i18n.t('errors.loadRole'), 'error');
        return;
      }
      const role = outcome.role;
      persistRememberedCoachingRole(userId, role);
      set({
        coachingRole: role,
        accountSnapshot: snapshot,
        accountWorkspace: snapshot?.coachCapability
          ? loadAccountWorkspace(userId) ?? 'coaching'
          : 'personal',
        roleReady: true,
        coachingRoleError: null,
        ...(role === 'client'
          ? { myTrackingConfig: cloneTracking(ALL_OFF_TRACKING), trackingReady: false }
          : { myTrackingConfig: cloneTracking(ALL_ON_TRACKING), trackingReady: true }),
      });
    } catch {
      set({
        coachingRole: previous,
        accountSnapshot: null,
        accountWorkspace: 'personal',
        coachingRoleError: 'network',
        roleReady: true,
      });
      toast(i18n.t('errors.loadRole'), 'error');
    }
  },

  selectAccountWorkspace: (workspace) => {
    const accountId = getSessionOwner();
    const snapshot = get().accountSnapshot;
    if (!accountId || snapshot?.userId !== accountId || !snapshot.coachCapability) return;
    persistAccountWorkspace(accountId, workspace);
    set({ accountWorkspace: workspace });
  },

  setCoachingRole: async (role) => {
    const { data, error } = await supabase.rpc('set_coaching_role', { p_role: role });
    if (error) return { error: error.message };
    const accountId = getSessionOwner();
    if (accountId) {
      await get().fetchMyRole(accountId);
    } else {
      set({ coachingRole: (data as CoachingRole) || role });
    }
    return { error: null };
  },

  applyIntendedCoachingRole: async () => {
    if (getPendingInviteToken()) return;
    const intended = getIntendedCoachingRole();
    if (!intended) return;
    // Never promote a visitor to client from a leftover picker claim.
    // Client role is assigned only by accept_coach_invite.
    if (intended !== 'coach') {
      clearIntendedCoachingRole();
      return;
    }
    const result = await get().setCoachingRole(intended);
    if (!result.error) clearIntendedCoachingRole();
  },

  enableCoachMode: async () => get().setCoachingRole('coach'),

  disableCoachMode: async () => get().setCoachingRole('none'),

  fetchClients: async () => {
    set({ loading: true });
    type LinkRow = {
      client_id: string;
      created_at: string;
      last_visited_at?: string | null;
      last_nudged_at?: string | null;
    };
    let links: LinkRow[] | null = null;
    const withNudge = await supabase
      .from('coach_client_links')
      .select('client_id, created_at, last_visited_at, last_nudged_at')
      .eq('status', 'active');
    if (withNudge.error) {
      const withVisit = await supabase
        .from('coach_client_links')
        .select('client_id, created_at, last_visited_at')
        .eq('status', 'active');
      if (withVisit.error) {
        const fallback = await supabase
          .from('coach_client_links')
          .select('client_id, created_at')
          .eq('status', 'active');
        if (fallback.error) {
          set({ loading: false, clientsFetchError: fallback.error.message });
          toast(i18n.t('errors.loadOps'), 'error');
          return;
        }
        if (!fallback.data?.length) {
          set({ clients: [], loading: false, clientsFetchError: null });
          return;
        }
        links = fallback.data as LinkRow[];
      } else {
        links = (withVisit.data ?? []) as LinkRow[];
      }
    } else {
      links = (withNudge.data ?? []) as LinkRow[];
    }
    if (!links.length) {
      set({ clients: [], loading: false });
      return;
    }
    const ids = links.map(l => l.client_id as string);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, avatar_url, onboarding_completed, goal, training_frequency, target_weight_kg, weight_kg, daily_calorie_target, protein_target, carbs_target, fat_target, kinesiology_intake')
      .in('id', ids);
    const linkedAt = new Map(links.map(l => [l.client_id as string, l.created_at as string]));
    const visitedAt = new Map(links.map(l => [l.client_id as string, l.last_visited_at ?? null]));
    const nudgedAt = new Map(links.map(l => [l.client_id as string, l.last_nudged_at ?? null]));
    const clients: CoachClientSummary[] = (profiles ?? []).map(p => ({
      id: p.id as string,
      full_name: (p.full_name as string) || '',
      email: (p.email as string) || '',
      avatar_url: (p.avatar_url as string) || '',
      linked_at: linkedAt.get(p.id as string) ?? '',
      onboarding_completed: !!p.onboarding_completed,
      goal: (p.goal as string) || '',
      training_frequency: Number(p.training_frequency) || 0,
      target_weight_kg: Number(p.target_weight_kg) || 0,
      weight_kg: Number(p.weight_kg) || 0,
      last_visited_at: visitedAt.get(p.id as string) ?? null,
      last_nudged_at: nudgedAt.get(p.id as string) ?? null,
      daily_calorie_target: Number(p.daily_calorie_target) || 0,
      protein_target: Number(p.protein_target) || 0,
      carbs_target: Number(p.carbs_target) || 0,
      fat_target: Number(p.fat_target) || 0,
      medical_flags: profileHasMedicalFlags(p.kinesiology_intake),
    }));
    clients.sort(compareRosterName);
    set({ clients, loading: false, clientsFetchError: null });
  },

  fetchCoachOps: async () => {
    set({ opsLoading: true });
    await Promise.all([get().fetchClients(), get().fetchPendingInterventions(), get().fetchCoachSettings()]);
    const clients = get().clients;
    if (get().clientsFetchError && clients.length === 0) {
      set({
        opsLoading: false,
        opsPartialError: get().clientsFetchError,
      });
      return;
    }
    if (clients.length === 0) {
      set({
        opsRows: [],
        opsLoading: false,
        opsPartialError: null,
        priorities: [],
        rosterSignals: EMPTY_SIGNALS,
        commandStats: EMPTY_STATS,
      });
      return;
    }
    const ids = clients.map(c => c.id);
    const settings = get().coachSettings ?? { coach_id: '', ...EMPTY_COACH_SETTINGS };
    const clock = coachClockFacts(new Date(), settings.timezone);
    const today = clock.today;
    const weekAgo = weekAgoStr(today);
    const threeWeeks = addDaysToDateStr(today, -20);
    const weekday = clock.weekday;

    const [
      trackingRes,
      assignmentRes,
      checkinTodayRes,
      nutritionRes,
      weightWeekRes,
      workoutWeekRes,
      checkinHistRes,
      weightHistRes,
      workoutHistRes,
      notesRes,
      interventionHistRes,
      nutritionHistRes,
    ] = await Promise.all([
      supabase.from('client_tracking_config').select('*').in('client_id', ids),
      supabase.from('program_assignments').select('client_id, program_id, start_date').in('client_id', ids).eq('status', 'active'),
      supabase.from('daily_checkins').select('user_id').in('user_id', ids).eq('checked_at', today),
      supabase.from('nutrition_logs').select('user_id').in('user_id', ids).eq('logged_at', today),
      supabase.from('weight_measurements').select('user_id').in('user_id', ids).gte('measured_at', weekAgo),
      supabase.from('workouts').select('user_id, date, completed').in('user_id', ids).eq('completed', true).gte('date', `${weekAgo}T00:00:00`),
      fetchAllRows(() => supabase.from('daily_checkins').select('*').in('user_id', ids).gte('checked_at', threeWeeks).order('checked_at', { ascending: false })),
      fetchAllRows(() => supabase.from('weight_measurements').select('*').in('user_id', ids).gte('measured_at', threeWeeks).order('measured_at', { ascending: false })),
      fetchAllRows(() => supabase.from('workouts').select('id, user_id, date, name, completed').in('user_id', ids).eq('completed', true).gte('date', `${threeWeeks}T00:00:00`).order('date', { ascending: false })),
      fetchAllRows(() => supabase.from('coach_notes').select('client_id, created_at').in('client_id', ids).order('created_at', { ascending: false })),
      fetchAllRows(() => supabase.from('coach_interventions').select('client_id, resolved_at, updated_at, status').in('client_id', ids).in('status', ['sent', 'kept'])),
      fetchAllRows(() => supabase.from('nutrition_logs').select('user_id, logged_at, calories').in('user_id', ids).gte('logged_at', threeWeeks)),
    ]);

    const partial = opsHasPartialError([
      trackingRes, assignmentRes, checkinTodayRes, nutritionRes, weightWeekRes,
      workoutWeekRes, checkinHistRes, weightHistRes, workoutHistRes, notesRes,
      interventionHistRes, nutritionHistRes,
    ]);

    const assignments = assignmentRes.data ?? [];
    const programIds = [...new Set(assignments.map(a => a.program_id as string))];
    let programDays: { program_id: string; weekday: number }[] = [];
    const programMeta = new Map<string, { name: string; duration_weeks: number }>();
    if (programIds.length > 0) {
      const [{ data: days }, { data: programs }] = await Promise.all([
        supabase.from('program_days').select('program_id, weekday').in('program_id', programIds),
        supabase.from('programs').select('id, name, duration_weeks').in('id', programIds),
      ]);
      programDays = (days ?? []) as { program_id: string; weekday: number }[];
      for (const p of programs ?? []) {
        programMeta.set(p.id as string, {
          name: (p.name as string) || '',
          duration_weeks: Number(p.duration_weeks) || 8,
        });
      }
    }

    const trackingByClient = new Map<string, ClientTrackingConfig>();
    for (const row of (trackingRes.error ? [] : trackingRes.data ?? []) as ClientTrackingConfig[]) {
      trackingByClient.set(row.client_id, row);
    }

    const assignedClientIds = new Set(assignments.map(a => a.client_id as string));
    const programByClient = new Map(assignments.map(a => [a.client_id as string, a.program_id as string]));
    const scheduledWeekdaysByClient = new Map<string, Set<number>>();
    const assignmentStart: Record<string, string> = {};
    const assignmentWeeks: Record<string, number> = {};
    const assignmentName: Record<string, string> = {};
    const scheduledDays: Record<string, number> = {};
    for (const client of clients) {
      const programId = programByClient.get(client.id);
      if (!programId) continue;
      const days = programDays.filter(d => d.program_id === programId).map(d => d.weekday);
      scheduledWeekdaysByClient.set(client.id, new Set(days));
      scheduledDays[client.id] = days.length;
      const asg = assignments.find(a => a.client_id === client.id);
      if (asg) assignmentStart[client.id] = asg.start_date as string;
      const meta = programMeta.get(programId);
      if (meta) {
        assignmentWeeks[client.id] = meta.duration_weeks;
        assignmentName[client.id] = meta.name;
      }
    }

    const workoutDatesByUser = new Map<string, string[]>();
    for (const w of workoutWeekRes.data ?? []) {
      const uid = w.user_id as string;
      const day = datePrefix(w.date as string);
      const list = workoutDatesByUser.get(uid) ?? [];
      list.push(day);
      workoutDatesByUser.set(uid, list);
    }

    const histWorkouts = (workoutHistRes.data ?? []) as Array<{
      id: string; user_id: string; date: string; name: string; completed: boolean;
    }>;
    const workoutIds = histWorkouts.map(w => w.id);
    let exercises: Array<{ id: string; workout_id: string; name: string }> = [];
    const sets: Array<{ exercise_id: string; weight_kg: number; reps: number; rir: number; completed: boolean; set_type?: string }> = [];
    if (workoutIds.length > 0) {
      const { data: exRows } = await supabase
        .from('workout_exercises')
        .select('id, workout_id, name')
        .in('workout_id', workoutIds);
      exercises = (exRows ?? []) as Array<{ id: string; workout_id: string; name: string }>;
      const exIds = exercises.map(e => e.id);
      if (exIds.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < exIds.length; i += 200) chunks.push(exIds.slice(i, i + 200));
        for (const chunk of chunks) {
          const { data: setRows } = await supabase
            .from('workout_sets')
            .select('exercise_id, weight_kg, reps, rir, completed, set_type')
            .in('exercise_id', chunk);
          sets.push(...((setRows ?? []) as typeof sets));
        }
      }
    }

    const lastNoteAt: Record<string, string> = {};
    for (const n of notesRes.data ?? []) {
      const id = n.client_id as string;
      if (!lastNoteAt[id]) lastNoteAt[id] = n.created_at as string;
    }
    const lastInterventionAt: Record<string, string> = {};
    for (const row of interventionHistRes.data ?? []) {
      const id = row.client_id as string | null;
      if (!id) continue;
      const at = (row.resolved_at as string) || (row.updated_at as string);
      if (!lastInterventionAt[id] || at > lastInterventionAt[id]) lastInterventionAt[id] = at;
    }

    const opsRows = buildClientOpsRows(clients, {
      today,
      weekAgo,
      weekday,
      localHour: clock.localHour,
      missedWorkoutCutoffHour: settings.missed_workout_cutoff_hour,
      checkinUserIds: new Set((checkinTodayRes.data ?? []).map(r => r.user_id as string)),
      nutritionUserIds: new Set((nutritionRes.data ?? []).map(r => r.user_id as string)),
      weightUserIds: new Set((weightWeekRes.data ?? []).map(r => r.user_id as string)),
      workoutDatesByUser,
      scheduledWeekdaysByClient,
      assignedClientIds,
      trackingByClient,
    });

    const calorieTargets: Record<string, number> = {};
    for (const c of clients) {
      calorieTargets[c.id] = c.daily_calorie_target ?? 0;
    }

    const rosterSignals: CoachRosterSignals = {
      checkins: (checkinHistRes.data ?? []) as DailyCheckin[],
      weights: (weightHistRes.data ?? []) as WeightMeasurement[],
      lifts: buildClientLifts(histWorkouts, exercises, sets),
      nutritionLogs: ((nutritionHistRes.data ?? []) as Array<{ user_id: string; logged_at: string; calories: number }>).map(row => ({
        user_id: row.user_id,
        logged_at: String(row.logged_at ?? '').slice(0, 10),
        calories: Number(row.calories) || 0,
      })),
      calorieTargets,
      lastNoteAt,
      lastInterventionAt,
      assignmentStart,
      assignmentWeeks,
      assignmentName,
      scheduledDays,
    };
    const priorities = buildCoachPriorities(opsRows, rosterSignals);
    set({
      opsRows,
      opsLoading: false,
      opsPartialError: partial,
      rosterSignals,
      priorities,
      commandStats: commandStats(opsRows, priorities, rosterSignals),
    });
  },

  fetchClientProfile: async (clientId) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', clientId)
      .maybeSingle();
    return (data as UserProfile | null) ?? null;
  },

  fetchTrackingConfig: async (clientId) => {
    const { data } = await supabase
      .from('client_tracking_config')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();
    return (data as ClientTrackingConfig | null) ?? null;
  },

  fetchMyTrackingConfig: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const isCoached = isCoachedAthlete(get().coachingRole, get().myCoach);
    if (!user) {
      const next = viewerTrackingAfterFetch({ isCoached: false, row: null, fetchError: false });
      set({ myTrackingConfig: next.tracking, trackingReady: true });
      return;
    }
    const { data, error } = await supabase
      .from('client_tracking_config')
      .select('*')
      .eq('client_id', user.id)
      .maybeSingle();
    const next = viewerTrackingAfterFetch({
      isCoached,
      row: data,
      fetchError: !!error,
    });
    set({ myTrackingConfig: next.tracking, trackingReady: next.ready });
  },

  saveTrackingConfig: async (clientId, data) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const current = parseResolvedTracking(data);
    const serialized = serializeTrackingVars({
      ...current,
      track_weight: data.track_weight ?? current.track_weight,
      track_checkins: data.track_checkins ?? current.track_checkins,
      track_nutrition: data.track_nutrition ?? current.track_nutrition,
      track_workouts: data.track_workouts ?? current.track_workouts,
      workout_focus: data.workout_focus ?? current.workout_focus,
      training: data.training ?? current.training,
      nutrition: data.nutrition ?? current.nutrition,
      checkin: data.checkin ?? current.checkin,
      setup_completed_at: data.setup_completed_at ?? current.setup_completed_at,
    });
    const payload = {
      coach_id: user.id,
      client_id: clientId,
      ...serialized,
      setup_completed_at: data.setup_completed_at ?? serialized.setup_completed_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('client_tracking_config')
      .upsert(payload, { onConflict: 'coach_id,client_id' });
    if (error) return { error: error.message };
    track('tracking_config_saved', {
      track_workouts: payload.track_workouts,
      track_nutrition: payload.track_nutrition,
      track_checkins: payload.track_checkins,
      track_weight: payload.track_weight,
    });
    return { error: null };
  },

  setClientNutritionTargets: async (clientId, targets) => {
    const { error } = await supabase.rpc('coach_set_client_nutrition_targets', {
      p_client_id: clientId,
      p_calories: Math.round(targets.calories),
      p_protein: Math.round(targets.protein),
      p_carbs: Math.round(targets.carbs),
      p_fat: Math.round(targets.fat),
    });
    if (error) return { error: error.message };
    track('nutrition_targets_set', { calories: Math.round(targets.calories) });
    return { error: null };
  },

  setClientVisibleProfile: async (clientId, patch) => {
    const { error } = await supabase.rpc('coach_set_client_visible_profile', {
      p_client_id: clientId,
      p_patch: patch,
    });
    if (error) return { error: error.message };
    return { error: null };
  },

  applyProgramOutline: async (clientId, outline) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const name = outline.name.trim();
    if (!name || outline.days.length === 0) return { error: null };
    const programs = useProgramStore.getState();
    // D01 : une seule RPC — programme + jours + exercices + attribution.
    const programId = await programs.createProgram({
      owner_id: user.id,
      name,
      description: outline.description,
      duration_weeks: outline.duration_weeks,
    }, outline.days.map((d, i) => ({
      weekday: d.weekday,
      name: d.name,
      routine_id: null,
      order_index: i,
      exercises: (d.exercises ?? []).map((ex, order_index) => ({
        name: ex.name,
        default_sets: ex.default_sets || 3,
        default_reps: ex.default_reps || 10,
        default_reps_min: ex.default_reps_min ?? null,
        default_rir: ex.default_rir ?? null,
        default_rest_seconds: ex.default_rest_seconds ?? 90,
        default_weight_kg: ex.default_weight_kg ?? null,
        order_index,
      })),
    })), { assignClientId: clientId, startDate: todayStr() });
    if (!programId) return { error: 'Failed to create program' };
    return { error: null };
  },

  fetchPendingInterventions: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ pendingInterventions: [] });
      return;
    }
    const { data, error } = await supabase
      .from('coach_interventions')
      .select('*')
      .eq('coach_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error || !data) {
      set({ pendingInterventions: [] });
      return;
    }
    const rows = data
      .map(row => mapInterventionRow(row as Record<string, unknown>))
      .filter((row): row is CoachIntervention => !!row);
    set({ pendingInterventions: rows });
  },

  fetchCoachMessages: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ sentMessages: [], unreadMessageCount: 0 });
      return;
    }
    const role = get().coachingRole;
    let query = supabase
      .from('coach_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    query = role === 'coach' ? query.eq('coach_id', user.id) : query.eq('client_id', user.id);
    const { data, error } = await query;
    if (error || !data) {
      set({ sentMessages: [] });
      return;
    }
    const messages = data
      .map(row => mapCoachMessage(row as Record<string, unknown>))
      .filter((row): row is CoachMessage => !!row);
    const unread = messages.filter(m => m.sender_id !== user.id && !m.read_at).length;
    set({ sentMessages: messages, unreadMessageCount: unread });
    // C02 : les compteurs exacts viennent du serveur (le chargement global est borné).
    void get().fetchUnreadCounts();
  },

  fetchThreadPage: async (clientId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || get().threadExhausted[clientId]) return;
    const thread = get().sentMessages
      .filter(m => m.client_id === clientId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const before = thread.length > 0 ? thread[0].created_at : null;
    const { data, error } = await supabase.rpc('fetch_thread_messages', {
      p_client_id: clientId,
      p_before: before,
      p_limit: 50,
    });
    if (error || !data) return;
    const page = (data as Record<string, unknown>[])
      .map(row => mapCoachMessage(row))
      .filter((row): row is CoachMessage => !!row);
    if (page.length === 0) {
      set(s => ({ threadExhausted: { ...s.threadExhausted, [clientId]: true } }));
      return;
    }
    set(s => {
      const known = new Set(s.sentMessages.map(m => m.id));
      const fresh = page.filter(m => !known.has(m.id));
      return { sentMessages: [...s.sentMessages, ...fresh] };
    });
  },

  fetchUnreadCounts: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.rpc('count_unread_messages');
    const rows = (data ?? []) as Array<{ client_id: string; unread_count: number }>;
    const total = rows.reduce((sum, row) => sum + Number(row.unread_count ?? 0), 0);
    set({ unreadMessageCount: total });
  },

  sendCoachMessage: async (clientId, body, templateKey, clientMsgId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const trimmed = body.trim();
    if (!trimmed) return { error: 'empty' };
    // C02 : idempotence retry — même client_msg_id = un seul message.
    const msgId = clientMsgId ?? crypto.randomUUID();
    const { data, error } = await supabase
      .from('coach_messages')
      .insert({
        coach_id: user.id,
        client_id: clientId,
        sender_id: user.id,
        body: trimmed,
        template_key: templateKey,
        client_msg_id: msgId,
      })
      .select()
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        // Retry après succès : le message existe déjà, on le réconcilie.
        const { data: existing } = await supabase
          .from('coach_messages')
          .select()
          .eq('sender_id', user.id)
          .eq('client_msg_id', msgId)
          .maybeSingle();
        const mapped = existing ? mapCoachMessage(existing as Record<string, unknown>) : null;
        if (mapped) {
          set(s => liveMessageState(s.sentMessages, 'INSERT', mapped, user.id));
          return { error: null };
        }
      }
      return { error: error.message ?? 'Failed to send' };
    }
    if (!data) return { error: 'Failed to send' };
    track('coach_message_sent', { template_key: templateKey });
    const iso = new Date().toISOString();
    await supabase
      .from('coach_client_links')
      .update({ last_nudged_at: iso, updated_at: iso })
      .eq('client_id', clientId)
      .eq('status', 'active');
    const mapped = mapCoachMessage(data as Record<string, unknown>);
    set(s => ({
      ...liveMessageState(s.sentMessages, 'INSERT', mapped, user.id),
      clients: s.clients.map(c => (c.id === clientId ? { ...c, last_nudged_at: iso } : c)),
      opsRows: s.opsRows.map(row => (
        row.client.id === clientId
          ? { ...row, client: { ...row.client, last_nudged_at: iso } }
          : row
      )),
    }));
    return { error: null };
  },

  sendClientReply: async (body, clientMsgId) => {
    const { data: { user } } = await supabase.auth.getUser();
    const coach = get().myCoach;
    if (!user || !coach) return { error: 'Not authenticated' };
    const trimmed = body.trim();
    if (!trimmed) return { error: 'empty' };
    const msgId = clientMsgId ?? crypto.randomUUID();
    const { data, error } = await supabase
      .from('coach_messages')
      .insert({
        coach_id: coach.id,
        client_id: user.id,
        sender_id: user.id,
        body: trimmed,
        template_key: 'reply',
        client_msg_id: msgId,
      })
      .select()
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from('coach_messages')
          .select()
          .eq('sender_id', user.id)
          .eq('client_msg_id', msgId)
          .maybeSingle();
        const mapped = existing ? mapCoachMessage(existing as Record<string, unknown>) : null;
        if (mapped) {
          set(s => liveMessageState(s.sentMessages, 'INSERT', mapped, user.id));
          return { error: null };
        }
      }
      return { error: error.message ?? 'Failed to send' };
    }
    if (!data) return { error: 'Failed to send' };
    track('client_reply_sent');
    const mapped = mapCoachMessage(data as Record<string, unknown>);
    set(s => liveMessageState(s.sentMessages, 'INSERT', mapped, user.id));
    return { error: null };
  },

  markCoachMessageRead: async (id) => {
    const iso = new Date().toISOString();
    await supabase.from('coach_messages').update({ read_at: iso }).eq('id', id);
    set(s => ({
      latestCoachMessage: s.latestCoachMessage?.id === id ? null : s.latestCoachMessage,
      sentMessages: s.sentMessages.map(m => (m.id === id ? { ...m, read_at: iso } : m)),
      unreadMessageCount: Math.max(0, s.unreadMessageCount - 1),
    }));
  },

  markThreadRead: async (clientId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const iso = new Date().toISOString();
    const unread = get().sentMessages.filter(m => m.client_id === clientId && m.sender_id !== user.id && !m.read_at);
    if (unread.length === 0) return;
    await supabase
      .from('coach_messages')
      .update({ read_at: iso })
      .in('id', unread.map(m => m.id));
    set(s => ({
      sentMessages: s.sentMessages.map(m => (
        m.client_id === clientId && m.sender_id !== user.id && !m.read_at
          ? { ...m, read_at: iso }
          : m
      )),
      latestCoachMessage: s.latestCoachMessage && unread.some(m => m.id === s.latestCoachMessage?.id)
        ? null
        : s.latestCoachMessage,
      unreadMessageCount: Math.max(0, s.unreadMessageCount - unread.length),
    }));
  },

  fetchCoachSettings: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ coachSettings: null });
      return;
    }
    const { data, error } = await supabase
      .from('coach_settings')
      .select('*')
      .eq('coach_id', user.id)
      .maybeSingle();
    if (error || !data) {
      set({
        coachSettings: { coach_id: user.id, ...EMPTY_COACH_SETTINGS },
      });
      return;
    }
    set({ coachSettings: mapCoachSettings(data as Record<string, unknown>, user.id) });
  },

  saveCoachSettings: async (patch) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const current = get().coachSettings ?? { coach_id: user.id, ...EMPTY_COACH_SETTINGS };
    const payload = {
      coach_id: user.id,
      visible_tabs: patch.visible_tabs ?? current.visible_tabs,
      nudge_templates: patch.nudge_templates ?? current.nudge_templates,
      default_tracking: patch.default_tracking ?? current.default_tracking,
      timezone: patch.timezone ?? current.timezone,
      missed_workout_cutoff_hour: patch.missed_workout_cutoff_hour ?? current.missed_workout_cutoff_hour,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('coach_settings')
      .upsert(payload, { onConflict: 'coach_id' })
      .select()
      .maybeSingle();
    if (error) return { error: error.message };
    set({
      coachSettings: data
        ? mapCoachSettings(data as Record<string, unknown>, user.id)
        : { ...current, ...patch, updated_at: payload.updated_at },
    });
    return { error: null };
  },

  fetchClientNutritionRange: async (clientId, start, end, calorieTarget) => {
    const { data } = await supabase
      .from('nutrition_logs')
      .select('logged_at, calories, protein, carbs, fat')
      .eq('user_id', clientId)
      .gte('logged_at', start)
      .lte('logged_at', end);
    return aggregateNutritionByDay(
      (data ?? []) as Array<{ logged_at: string; calories: number; protein: number; carbs: number; fat: number }>,
      calorieTarget,
    );
  },

  fetchClientLiftHistory: async (clientId) => {
    const start = addDaysToDateStr(todayStr(), -90);
    const { data: workoutRows } = await supabase
      .from('workouts')
      .select('id, user_id, date, name, completed')
      .eq('user_id', clientId)
      .eq('completed', true)
      .gte('date', `${start}T00:00:00`)
      .order('date', { ascending: false })
      .limit(80);
    const histWorkouts = (workoutRows ?? []) as Array<{
      id: string; user_id: string; date: string; name: string; completed: boolean;
    }>;
    if (histWorkouts.length === 0) return [];
    const { data: exRows } = await supabase
      .from('workout_exercises')
      .select('id, workout_id, name')
      .in('workout_id', histWorkouts.map(w => w.id));
    const exercises = (exRows ?? []) as Array<{ id: string; workout_id: string; name: string }>;
    const sets: Array<{ exercise_id: string; weight_kg: number; reps: number; rir: number; completed: boolean; set_type?: string }> = [];
    const exIds = exercises.map(e => e.id);
    for (let i = 0; i < exIds.length; i += 200) {
      const { data: setRows } = await supabase
        .from('workout_sets')
        .select('exercise_id, weight_kg, reps, rir, completed, set_type')
        .in('exercise_id', exIds.slice(i, i + 200));
      sets.push(...((setRows ?? []) as typeof sets));
    }
    return buildClientLifts(histWorkouts, exercises, sets);
  },

  fetchProgressPhotos: async (userId) => {
    const { data, error } = await supabase
      .from('progress_photos')
      .select('*')
      .eq('user_id', userId)
      .order('taken_at', { ascending: false });
    if (error || !data) return [];
    return data as ProgressPhoto[];
  },

  uploadProgressPhoto: async ({ file, takenAt, kind, notes }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    // Q02 : validation réelle avant envoi (le accept= du input n'est qu'indicatif).
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.heic') || lower.endsWith('.heif') || file.type.toLowerCase().includes('heic') || file.type.toLowerCase().includes('heif')) {
      return { error: 'heic_unsupported' };
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    const extOk = ['.jpg', '.jpeg', '.png', '.webp'].some(e => lower.endsWith(e));
    if (!allowed.includes(file.type.toLowerCase()) && !extOk) {
      return { error: 'unsupported_type' };
    }
    if (file.size > 5 * 1024 * 1024) {
      return { error: 'too_large' };
    }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('progress-photos')
      .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
    if (uploadError) return { error: uploadError.message };
    const { data, error } = await supabase
      .from('progress_photos')
      .insert({
        user_id: user.id,
        taken_at: takenAt,
        kind,
        storage_path: path,
        notes: (notes ?? '').trim(),
      })
      .select()
      .maybeSingle();
    if (error || !data) {
      await supabase.storage.from('progress-photos').remove([path]);
      return { error: error?.message ?? 'Failed to save photo' };
    }
    return { photo: data as ProgressPhoto };
  },

  deleteProgressPhoto: async (id, storagePath) => {
    // Q02 : fichier d'abord — en cas d'échec rien n'est perdu et on réessaie.
    // (L'inverse laisserait un fichier orphelin irrécupérable.)
    const { error: fileError } = await supabase.storage.from('progress-photos').remove([storagePath]);
    if (fileError) return { error: fileError.message };
    const { error } = await supabase.from('progress_photos').delete().eq('id', id);
    if (error) return { error: error.message };
    return { error: null };
  },

  signProgressPhotoUrls: async (photos) => {
    if (photos.length === 0) return {};
    const { data, error } = await supabase.storage
      .from('progress-photos')
      .createSignedUrls(photos.map(p => p.storage_path), 3600);
    if (error || !data) return {};
    const out: Record<string, string> = {};
    data.forEach((row, i) => {
      if (row.signedUrl && photos[i]) out[photos[i].id] = row.signedUrl;
    });
    return out;
  },

  dismissQueueItem: (id) => {
    get().dismissQueueItems([id]);
  },

  dismissQueueItems: (ids) => {
    if (ids.length === 0) return;
    set(s => {
      const next = [...s.queueDismissedIds];
      const seen = new Set(next);
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          next.push(id);
        }
      }
      saveQueueDismissed(next);
      return { queueDismissedIds: next };
    });
  },

  fetchIntervention: async (id) => {
    const { data, error } = await supabase
      .from('coach_interventions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return mapInterventionRow(data as Record<string, unknown>);
  },

  fetchOnboardingPlanDraft: async (clientId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('coach_interventions')
      .select('*')
      .eq('coach_id', user.id)
      .eq('client_id', clientId)
      .eq('kind', 'onboarding_plan')
      .eq('status', 'pending')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return mapInterventionRow(data as Record<string, unknown>);
  },

  resolveIntervention: async (id, status, payload) => {
    // Chemin sans effets externes (dismiss pur) : un seul UPDATE conditionnel,
    // atomique par nature. Avec effets → claim/finalize ci-dessous.
    const updates: Record<string, unknown> = {
      status,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (payload) updates.payload = payload;
    const { data, error } = await supabase
      .from('coach_interventions')
      .update(updates)
      .eq('id', id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'already_resolved' };
    const resolved = get().pendingInterventions.find(row => row.id === id);
    track('intervention_resolved', {
      kind: resolved?.kind ?? null,
      source: resolved?.source ?? null,
      status,
      edited: !!payload,
    });
    set(s => ({
      pendingInterventions: s.pendingInterventions.filter(row => row.id !== id),
    }));
    return { error: null };
  },

  claimIntervention: async (id) => {
    const keys = loadOrCreateInterventionKeys(id);
    const { data, error } = await supabase.rpc('claim_intervention', {
      p_id: id,
      p_claim_key: keys.claimKey,
    });
    if (error) return { error: error.message };
    const outcome = data as { ok: boolean; reason?: string; already_done?: boolean } | null;
    if (!outcome?.ok) return { error: outcome?.reason ?? 'already_resolved' };
    return { claimKey: keys.claimKey };
  },

  applyIntervention: async (id, status, payload, effects) => {
    const persistId = id ?? `setup:${effects.assign_client_id ?? 'self'}`;
    const keys = loadOrCreateInterventionKeys(persistId);
    const { data, error } = await supabase.rpc('apply_intervention', {
      p_id: id,
      p_idempotency_key: keys.idempotencyKey,
      p_claim_key: keys.claimKey,
      p_status: status,
      p_payload: (payload ?? null) as unknown as Record<string, never> | null,
      p_effects: effectsToJson(effects) as unknown as Record<string, never>,
      p_client_msg_id: effects.message ? keys.clientMsgId : null,
    });
    if (error) return { error: error.message };
    const outcome = data as { ok: boolean; reason?: string; replayed?: boolean } | null;
    if (!outcome?.ok) return { error: outcome?.reason ?? 'already_resolved' };
    if (id) {
      const resolved = get().pendingInterventions.find(row => row.id === id);
      if (!outcome.replayed) {
        track('intervention_resolved', {
          kind: resolved?.kind ?? null,
          source: resolved?.source ?? null,
          status,
          edited: !!payload,
        });
      }
      set(s => ({
        pendingInterventions: s.pendingInterventions.filter(row => row.id !== id),
      }));
    }
    return { error: null, replayed: !!outcome.replayed };
  },

  releaseIntervention: async (id, claimKey) => {
    await supabase.rpc('release_intervention_claim', {
      p_id: id,
      p_claim_key: claimKey,
    });
  },

  finalizeIntervention: async (id, claimKey, status, payload) => {
    const { data, error } = await supabase.rpc('finalize_intervention', {
      p_id: id,
      p_claim_key: claimKey,
      p_status: status,
      p_payload: (payload ?? null) as unknown as Record<string, never> | null,
    });
    if (error) return { error: error.message };
    const outcome = data as { ok: boolean; reason?: string } | null;
    if (!outcome?.ok) return { error: outcome?.reason ?? 'already_resolved' };
    const resolved = get().pendingInterventions.find(row => row.id === id);
    track('intervention_resolved', {
      kind: resolved?.kind ?? null,
      source: resolved?.source ?? null,
      status,
      edited: !!payload,
    });
    set(s => ({
      pendingInterventions: s.pendingInterventions.filter(row => row.id !== id),
    }));
    return { error: null };
  },

  askCoachAgent: async (input) => {
    const { data, error } = await supabase.functions.invoke(COACH_AGENT_FUNCTION, {
      body: {
        kind: input.kind,
        client_id: input.clientId ?? null,
        program_id: input.programId ?? null,
        prompt: input.prompt,
        screen: input.screen,
        context: input.context ?? {},
        locale: i18n.language,
      },
    });
    const bodyFromData = (data && typeof data === 'object' && !Array.isArray(data))
      ? data as Record<string, unknown>
      : {};
    const bodyFromError = error ? await functionsErrorBody(error) : {};
    const body = Object.keys(bodyFromData).length > 0 ? bodyFromData : bodyFromError;
    const outcome = parseCoachAgentResponse(body, error ? functionsHttpStatus(error) || 502 : 200);
    if (outcome.kind === 'error') {
      return { error: outcome.code };
    }
    const rawIntervention = body.intervention && typeof body.intervention === 'object'
      ? mapInterventionRow(body.intervention as Record<string, unknown>)
      : null;
    const id = outcome.kind === 'ready' || outcome.kind === 'poll'
      ? (outcome.id ?? rawIntervention?.id)
      : rawIntervention?.id;
    let row = rawIntervention;
    if (!row && id) row = await get().fetchIntervention(id);
    track('agent_asked', { kind: input.kind, screen: input.screen, landed: !!row });
    if (row) {
      set(s => ({
        pendingInterventions: mergeInterventionRealtime(s.pendingInterventions, 'INSERT', row),
      }));
      if (isInterventionDrafting(row)) void get().startCoachRealtime();
    }
    if (!row) {
      const errCode = typeof body.error === 'string' ? body.error : '';
      if (functionsHttpStatus(error) === 429 || errCode === 'DAILY_LIMIT_REACHED') {
        return { error: 'DAILY_LIMIT_REACHED' };
      }
      return { error: errCode || 'ai_unavailable' };
    }
    return { id: row.id };
  },

  runFleetRound: async () => {
    if (get().fleetRunning) return { error: null };
    set({ fleetRunning: true });
    const { data, error } = await supabase.functions.invoke('coach-fleet-round', {
      body: { trigger: 'on_demand' },
    });
    const bodyFromData = (data && typeof data === 'object' && !Array.isArray(data))
      ? data as Record<string, unknown>
      : {};
    const bodyFromError = error ? await functionsErrorBody(error) : {};
    const body = Object.keys(bodyFromData).length > 0 ? bodyFromData : bodyFromError;
    const errCode = typeof body.error === 'string' ? body.error : '';
    const stats = {
      clients_seen: Number(body.clients_seen) || 0,
      clients_flagged: Number(body.clients_flagged) || 0,
      clients_skipped: Number(body.clients_skipped) || 0,
      model_used: typeof body.model_used === 'string' ? body.model_used : null,
    };
    set({
      fleetRunning: false,
      lastFleetRound: stats,
    });
    track('fleet_round_run', {
      trigger: 'on_demand',
      seen: stats.clients_seen,
      flagged: stats.clients_flagged,
      skipped: stats.clients_skipped,
      failed: !!error,
    });
    await get().fetchPendingInterventions();
    if (error && errCode) return { error: errCode, ...stats };
    if (error && !body.cards) return { error: errCode || 'fleet_failed', ...stats };
    return { error: null, ...stats };
  },

  startCoachRealtime: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (get().coachingRole !== 'coach') return;
    void get().fetchCoachMessages();
    if (!coachRealtimeChannel) {
      void get().fetchPendingInterventions();
      coachRealtimeChannel = supabase
        .channel(`coach-live-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'coach_interventions',
            filter: `coach_id=eq.${user.id}`,
          },
          payload => {
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const mapped = raw ? mapInterventionRow(raw) : null;
            if (!mapped) {
              void get().fetchPendingInterventions();
              return;
            }
            const event = payload.eventType === 'DELETE' ? 'DELETE' : payload.eventType;
            set(s => ({
              pendingInterventions: mergeInterventionRealtime(s.pendingInterventions, event, mapped),
            }));
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'coach_messages',
            filter: `coach_id=eq.${user.id}`,
          },
          payload => {
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const mapped = raw ? mapCoachMessage(raw) : null;
            if (!mapped) {
              void get().fetchCoachMessages();
              return;
            }
            const event = payload.eventType === 'DELETE' ? 'DELETE' : payload.eventType;
            set(s => liveMessageState(s.sentMessages, event, mapped, user.id));
          },
        )
        .subscribe(status => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            void get().fetchPendingInterventions();
            void get().fetchCoachMessages();
          }
        });
    }
    if (!coachPollTimer) {
      coachPollTimer = setInterval(() => {
        if (get().pendingInterventions.some(isInterventionDrafting)) {
          void get().fetchPendingInterventions();
        }
      }, COACH_REALTIME_POLL_MS);
    }
  },

  stopCoachRealtime: () => {
    if (coachRealtimeChannel) {
      void supabase.removeChannel(coachRealtimeChannel);
      coachRealtimeChannel = null;
    }
    if (coachPollTimer) {
      clearInterval(coachPollTimer);
      coachPollTimer = null;
    }
  },

  startClientRealtime: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (get().coachingRole === 'coach') return;
    void get().fetchMyCoach().then(() => {
      void get().fetchCoachMessages();
      void get().fetchMyTrackingConfig();
    });
    void useProgramStore.getState().fetchMyAssignment(user.id);
    void get().fetchPendingInterventions();
    if (!clientRealtimeChannel) {
      clientRealtimeChannel = supabase
        .channel(`client-live-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'coach_messages',
            filter: `client_id=eq.${user.id}`,
          },
          payload => {
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const mapped = raw ? mapCoachMessage(raw) : null;
            if (!mapped) {
              void get().fetchCoachMessages();
              return;
            }
            const event = payload.eventType === 'DELETE' ? 'DELETE' : payload.eventType;
            set(s => liveMessageState(s.sentMessages, event, mapped, user.id));
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'program_assignments',
            filter: `client_id=eq.${user.id}`,
          },
          payload => {
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            if (!shouldRefreshClientAssignment(payload.eventType, raw, user.id) && payload.eventType !== 'DELETE') {
              return;
            }
            void useProgramStore.getState().fetchMyAssignment(user.id);
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_profiles',
            filter: `id=eq.${user.id}`,
          },
          payload => {
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            // The coach ended the link: role went back to 'none' server-side — reload role, coach
            // and profile so the athlete lands on the solo home without a reload (VISION point 4).
            if (profileLinkEndedChanged(useProfileStore.getState().profile, raw)) {
              void useProfileStore.getState().fetchProfile(user.id, { silent: true });
              void get().fetchMyRole(user.id).then(() => get().fetchMyCoach());
              return;
            }
            const targets = nutritionTargetsFromProfileRow(raw);
            if (targets) {
              useProfileStore.getState().applyRemoteTargets(user.id, targets);
              return;
            }
            void useProfileStore.getState().fetchProfile(user.id, { silent: true });
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'client_tracking_config',
            filter: `client_id=eq.${user.id}`,
          },
          payload => {
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const isCoached = isCoachedAthlete(get().coachingRole, get().myCoach);
            if (payload.eventType === 'DELETE' || !raw) {
              set({ myTrackingConfig: resolveViewerTracking(null, isCoached), trackingReady: true });
              return;
            }
            set({ myTrackingConfig: resolveViewerTracking(raw, isCoached), trackingReady: true });
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'coach_interventions',
            filter: `client_id=eq.${user.id}`,
          },
          payload => {
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const mapped = raw ? mapInterventionRow(raw) : null;
            if (!mapped) {
              void get().fetchPendingInterventions();
              return;
            }
            const event = payload.eventType === 'DELETE' ? 'DELETE' : payload.eventType;
            set(s => ({
              pendingInterventions: mergeInterventionRealtime(s.pendingInterventions, event, mapped),
            }));
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'program_days',
          },
          payload => {
            if (!shouldRefreshClientProgramContent(payload.eventType)) return;
            void useProgramStore.getState().fetchMyAssignment(user.id);
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'program_day_exercises',
          },
          payload => {
            if (!shouldRefreshClientProgramContent(payload.eventType)) return;
            void useProgramStore.getState().fetchMyAssignment(user.id);
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'progress_photos',
            filter: `user_id=eq.${user.id}`,
          },
          payload => {
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            if (!shouldRefreshProgressPhotos(payload.eventType, raw, user.id) && payload.eventType !== 'DELETE') {
              return;
            }
            set(s => ({ progressPhotosEpoch: s.progressPhotosEpoch + 1 }));
          },
        )
        .subscribe(status => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            void get().fetchCoachMessages();
            void useProgramStore.getState().fetchMyAssignment(user.id);
            void useProfileStore.getState().fetchProfile(user.id, { silent: true });
            void get().fetchMyTrackingConfig();
            void get().fetchPendingInterventions();
            set(s => ({ progressPhotosEpoch: s.progressPhotosEpoch + 1 }));
          }
        });
    }
  },

  stopClientRealtime: () => {
    if (clientRealtimeChannel) {
      void supabase.removeChannel(clientRealtimeChannel);
      clientRealtimeChannel = null;
    }
  },

  subscribeClientDossier: (clientId, onInvalidate) => {
    const existing = dossierChannels.get(clientId);
    if (existing) void supabase.removeChannel(existing);
    // C01 : RLS restreint déjà aux suivis du coach ; on filtre par client côté réception.
    const tables = [
      'workouts', 'workout_exercises', 'workout_sets',
      'nutrition_logs', 'water_logs', 'weight_measurements',
      'daily_checkins', 'daily_steps',
    ];
    let channel = supabase.channel(`client-dossier-${clientId}`);
    const userOf = (row: Record<string, unknown> | undefined): string | null => {
      if (!row) return null;
      const direct = row.user_id;
      if (typeof direct === 'string') return direct;
      return null;
    };
    for (const table of tables) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        payload => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
          if (userOf(row) === clientId) onInvalidate();
          // workout_exercises/sets ne portent pas user_id : toute écriture invalide.
          if ((table === 'workout_exercises' || table === 'workout_sets') && !userOf(row)) onInvalidate();
        },
      );
    }
    const subscribed = channel.subscribe();
    dossierChannels.set(clientId, subscribed);
    return () => {
      void supabase.removeChannel(subscribed);
      if (dossierChannels.get(clientId) === subscribed) dossierChannels.delete(clientId);
    };
  },

  fetchClientAssignments: async (clientId) => {
    const { data } = await supabase
      .from('program_assignments')
      .select('*, programs(name)')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false });
    return ((data ?? []) as Array<ProgramAssignment & { programs?: { name: string } | null }>)
      .filter(a => a.status === 'active' || a.status === 'paused');
  },

  adoptClientProgram: async (programId, clientId) => {
    const { data, error } = await supabase.rpc('adopt_client_program', {
      p_program_id: programId,
      p_client_id: clientId,
    });
    if (error || !data) return { error: error?.message ?? 'Adoption impossible' };
    track('program_adopted', {});
    return { programId: data as string };
  },

  createIntervention: async (input) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const row = {
      coach_id: user.id,
      client_id: input.clientId,
      kind: input.kind,
      title: input.title,
      rationale: input.rationale,
      payload: { ...input.payload, source: input.source ?? 'prometheus_local' },
      status: 'pending' as const,
      source: input.source ?? 'prometheus_local',
    };
    const inserted = await supabase.from('coach_interventions').insert(row).select().maybeSingle();
    if (inserted.error || !inserted.data) {
      const { data, error } = await supabase.rpc('upsert_coach_intervention', {
        p_coach_id: user.id,
        p_client_id: input.clientId,
        p_kind: input.kind,
        p_rationale: input.rationale,
        p_payload: row.payload,
        p_title: input.title,
      });
      if (error || !data) return { error: error?.message ?? inserted.error?.message ?? 'Failed to create draft' };
      await get().fetchPendingInterventions();
      return { id: data as string };
    }
    const mapped = mapInterventionRow(inserted.data as Record<string, unknown>);
    if (mapped) {
      set(s => ({ pendingInterventions: [mapped, ...s.pendingInterventions] }));
    }
    return { id: inserted.data.id as string };
  },

  touchClientVisit: async (clientId) => {
    const iso = new Date().toISOString();
    await supabase
      .from('coach_client_links')
      .update({ last_visited_at: iso, updated_at: iso })
      .eq('client_id', clientId)
      .eq('status', 'active');
    // Keep the in-memory last_visited_at as the previous visit so Client 360
    // "since last visit" is computed against what the coach had not yet seen.
  },

  fetchInvites: async () => {
    const { data } = await supabase
      .from('coach_invites')
      .select('*')
      .order('created_at', { ascending: false });
    set({ invites: (data ?? []) as CoachInvite[] });
  },

  createInvite: async (opts) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const days = opts?.days ?? 7;
    const maxUses = opts?.maxUses ?? 1;
    const token = crypto.randomUUID().replace(/-/g, '');
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    const { data, error } = await supabase
      .from('coach_invites')
      .insert({
        coach_id: user.id,
        token,
        expires_at: expires,
        max_uses: maxUses,
      })
      .select()
      .maybeSingle();
    if (error || !data) return { error: error?.message ?? 'Failed to create invite' };
    track('invite_created', { days, max_uses: maxUses });
    set(s => ({ invites: [data as CoachInvite, ...s.invites] }));
    return { token };
  },

  revokeInvite: async (id) => {
    await supabase.from('coach_invites').delete().eq('id', id);
    set(s => ({ invites: s.invites.filter(i => i.id !== id) }));
  },

  fetchMyCoach: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({
        myCoach: null,
        latestCoachMessage: null,
        unreadMessageCount: 0,
        myTrackingConfig: cloneTracking(ALL_ON_TRACKING),
        trackingReady: true,
      });
      return;
    }
    const { data: link } = await supabase
      .from('coach_client_links')
      .select('coach_id')
      .eq('client_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!link) {
      set({
        myCoach: null,
        latestCoachMessage: null,
        unreadMessageCount: 0,
        myTrackingConfig: cloneTracking(ALL_ON_TRACKING),
        trackingReady: get().coachingRole !== 'client',
      });
      if (get().coachingRole === 'client') await get().fetchMyTrackingConfig();
      return;
    }
    // S03 : carte coach minimale via RPC — le client ne lit plus user_profiles.
    const { data: card } = await supabase.rpc('get_my_coach_card').maybeSingle();
    const profile = card as { coach_id: string; full_name: string; avatar_url: string | null } | null;
    if (!profile) {
      set({ myCoach: null, latestCoachMessage: null, unreadMessageCount: 0 });
      await get().fetchMyTrackingConfig();
      return;
    }
    const { data: msgs } = await supabase
      .from('coach_messages')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    const messages = (msgs ?? [])
      .map(row => mapCoachMessage(row as Record<string, unknown>))
      .filter((row): row is CoachMessage => !!row);
    const unread = messages.filter(m => m.sender_id !== user.id && !m.read_at);
    set({
      myCoach: {
        id: profile.coach_id as string,
        full_name: (profile.full_name as string) || '',
        avatar_url: (profile.avatar_url as string) || '',
      },
      latestCoachMessage: unread[0] ?? null,
      sentMessages: messages,
      unreadMessageCount: unread.length,
    });
    await get().fetchMyTrackingConfig();
  },

  acceptInvite: async (token) => {
    const accountId = getSessionOwner();
    if (!accountId) return { ok: false, error: 'not_authenticated' };
    if (acceptInviteInFlight) return { ok: false, error: 'operation_pending' };
    acceptInviteInFlight = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.id !== accountId) return { ok: false, error: 'not_authenticated' };
      const { data, error } = await supabase.rpc('accept_coach_invite', {
        p_token: token,
        ...directInviteConsentArgs(),
      });
      if (getSessionOwner() !== accountId) return { ok: false, error: 'session_changed' };
      if (error) return { ok: false, error: error.message };
      const result = data as { ok?: boolean; error?: string; coach_name?: string } | null;
      if (result?.ok !== true) return { ok: false, error: result?.error ?? 'invalid_response' };
      clearPendingInviteToken();
      clearIntendedCoachingRole();
      await get().fetchMyCoach();
      if (getSessionOwner() === accountId) await get().fetchMyRole(accountId);
      track('invite_accepted');
      return { ok: true, coach_name: result.coach_name };
    } catch {
      return { ok: false, error: getSessionOwner() === accountId ? 'network' : 'session_changed' };
    } finally {
      acceptInviteInFlight = false;
    }
  },

  previewInvite: async (token) => {
    const { data, error } = await supabase.rpc('get_coach_invite_preview', { p_token: token });
    if (error) return { valid: false, coach_name: null, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { valid: false, coach_name: null };
    return {
      valid: !!row.valid,
      coach_name: (row.coach_name as string) || null,
    };
  },

  fetchClientWorkouts: async (clientId) => {
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', clientId)
      .order('date', { ascending: false })
      .limit(60);
    return (data ?? []) as Workout[];
  },

  fetchClientWorkout: async (workoutId) => {
    const { data: workout } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', workoutId)
      .maybeSingle();
    if (!workout) return null;
    const { data: exercises } = await supabase
      .from('workout_exercises')
      .select('*')
      .eq('workout_id', workoutId)
      .order('order_index');
    const exIds = (exercises ?? []).map(e => e.id);
    let sets: WorkoutSet[] = [];
    if (exIds.length > 0) {
      const { data: setsData } = await supabase
        .from('workout_sets')
        .select('*')
        .in('exercise_id', exIds)
        .order('order_index');
      sets = (setsData ?? []) as WorkoutSet[];
    }
    const fullExercises = (exercises ?? []).map(ex => ({
      ...ex,
      sets: sets.filter(s => s.exercise_id === ex.id),
    })) as WorkoutExercise[];
    return { ...workout, exercises: fullExercises } as Workout;
  },

  fetchClientNutrition: async (clientId, date) => {
    const [{ data: logs }, { data: water }] = await Promise.all([
      supabase.from('nutrition_logs').select('*').eq('user_id', clientId).eq('logged_at', date),
      supabase.from('water_logs').select('*').eq('user_id', clientId).eq('logged_at', date),
    ]);
    return {
      logs: (logs ?? []) as NutritionLog[],
      water: (water ?? []) as WaterLog[],
    };
  },

  fetchClientWeight: async (clientId) => {
    const { data } = await supabase
      .from('weight_measurements')
      .select('*')
      .eq('user_id', clientId)
      .order('measured_at', { ascending: false })
      .limit(90);
    return (data ?? []) as WeightMeasurement[];
  },

  fetchClientCheckins: async (clientId) => {
    const { data } = await supabase
      .from('daily_checkins')
      .select('*')
      .eq('user_id', clientId)
      .order('checked_at', { ascending: false })
      .limit(21);
    return (data ?? []) as DailyCheckin[];
  },

  fetchNotes: async (clientId) => {
    const { data } = await supabase
      .from('coach_notes')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    set({ notes: (data ?? []) as CoachNote[] });
  },

  addNote: async (clientId, body, opts) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await supabase
      .from('coach_notes')
      .insert({
        coach_id: user.id,
        client_id: clientId,
        body: body.trim(),
        note_date: opts?.noteDate ?? todayStr(),
        workout_id: opts?.workoutId ?? null,
      })
      .select()
      .maybeSingle();
    if (error || !data) return { error: error?.message ?? 'Failed to save note' };
    set(s => ({ notes: [data as CoachNote, ...s.notes] }));
    return { error: null };
  },

  deleteNote: async (id) => {
    await supabase.from('coach_notes').delete().eq('id', id);
    set(s => ({ notes: s.notes.filter(n => n.id !== id) }));
  },

  endMyCoachLink: async () => {
    const accountId = getSessionOwner();
    if (!accountId) return { error: 'not_authenticated' };
    if (endMyCoachLinkInFlight) return { error: 'operation_pending' };
    endMyCoachLinkInFlight = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.id !== accountId) return { error: 'not_authenticated' };
      const { data, error } = await supabase.rpc('client_end_coach_link');
      if (getSessionOwner() !== accountId) return { error: 'session_changed' };
      if (error) return { error: error.message };
      const payload = data as { ok?: boolean; error?: string; ended_at?: string } | null;
      if (payload?.ok !== true) return { error: payload?.error ?? 'invalid_response' };

      get().stopClientRealtime();
      // Leaving personal coaching does not remove professional coach capability.
      const role = get().coachingRole === 'coach' ? 'coach' : 'none';
      persistRememberedCoachingRole(accountId, role);
      if (typeof payload.ended_at === 'string') {
        useProfileStore.getState().applyCoachingDeparture(accountId, payload.ended_at);
      }
      const snapshot = get().accountSnapshot;
      set({
        coachingRole: role,
        roleReady: true,
        coachingRoleError: null,
        myCoach: null,
        myTrackingConfig: cloneTracking(ALL_ON_TRACKING),
        trackingReady: true,
        latestCoachMessage: null,
        unreadMessageCount: 0,
        sentMessages: [],
        threadExhausted: {},
        accountSnapshot: snapshot && snapshot.userId === accountId
          ? { ...snapshot, activeCoachId: null, legacyRole: role }
          : snapshot,
      });
      return { error: null };
    } catch {
      return { error: getSessionOwner() === accountId ? 'network' : 'session_changed' };
    } finally {
      endMyCoachLinkInFlight = false;
    }
  },

  endClientLink: async (linkClientId) => {
    const accountId = getSessionOwner();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'not_authenticated' };
    if (accountId && user.id !== accountId) return { error: 'session_changed' };
    if (linkClientId === user.id) return { error: 'cannot_end_self' };

    const { data, error } = await supabase.rpc('end_coach_client_link', {
      p_client_id: linkClientId,
    });
    if (error) return { error: error.message };
    const payload = data as { ok?: boolean; error?: string } | null;
    if (payload?.ok !== true) return { error: payload?.error ?? 'invalid_response' };

    set(s => dropUnlinkedClient(s, linkClientId));
    return { error: null };
  },

  clear: () => {
    get().stopCoachRealtime();
    get().stopClientRealtime();
    for (const channel of dossierChannels.values()) void supabase.removeChannel(channel);
    dossierChannels.clear();
    set({
      coachingRole: 'none',
      roleReady: false,
      coachingRoleError: null,
      accountSnapshot: null,
      accountWorkspace: 'personal',
      clients: [],
      clientsFetchError: null,
      invites: [],
      myCoach: null,
      notes: [],
      opsRows: [],
      opsLoading: false,
      opsPartialError: null,
      pendingInterventions: [],
      sentMessages: [],
      latestCoachMessage: null,
      unreadMessageCount: 0,
      threadExhausted: {},
      coachSettings: null,
      myTrackingConfig: cloneTracking(ALL_ON_TRACKING),
      trackingReady: false,
      queueDismissedIds: [],
      priorities: [],
      rosterSignals: EMPTY_SIGNALS,
      commandStats: EMPTY_STATS,
      fleetRunning: false,
      lastFleetRound: null,
      progressPhotosEpoch: 0,
    });
  },
}));
