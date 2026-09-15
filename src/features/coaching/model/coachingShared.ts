import type { RealtimeChannel } from '@supabase/supabase-js';
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
} from '../../../lib/types';
import type { ProgramOutlineDraft } from '../../../lib/coachInterventions';
import type { SecondPingKind } from '../../../lib/coachSecond';
import type { ResolvedTrackingConfig } from '../../../lib/clientTracking';
import {
  ALL_ON_TRACKING,
} from '../../../lib/clientTracking';
import {
  cloneTracking,
  parseRememberedCoachingRole,
} from '../../../lib/coachStoreGuards';
import {
  commandStats,
} from '../../../lib/coachPriorities';
import {
  todayStr,
} from '../../../lib/utils';
import type { ClientVisibleProfilePatch } from '../../../lib/coachClientProfile';
import type {
  AccountSnapshot,
  AccountWorkspace,
} from '../../../lib/accountContext';
import type { StoreApi } from 'zustand';

export const coachingRuntime = {
  endMyCoachLinkInFlight: false,
  acceptInviteInFlight: false,
  coachRealtimeChannel: null as RealtimeChannel | null,
  coachPollTimer: null as ReturnType<typeof setInterval> | null,
  clientRealtimeChannel: null as RealtimeChannel | null,
};

const LAST_ROLE_KEY = 'prometheus_last_coaching_role';

export function lastRoleStorageKey(userId: string) {
  return `${LAST_ROLE_KEY}:${userId}`;
}

export function loadRememberedCoachingRole(userId: string): CoachingRole | null {
  try {
    return parseRememberedCoachingRole(localStorage.getItem(lastRoleStorageKey(userId)));
  } catch {
    return null;
  }
}

export function persistRememberedCoachingRole(userId: string, role: CoachingRole) {
  try {
    localStorage.setItem(lastRoleStorageKey(userId), role);
  } catch {
    // private mode / quota
  }
}

export const EMPTY_SIGNALS: CoachRosterSignals = {
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

export const EMPTY_STATS: CoachCommandStats = {
  activeClients: 0,
  needAttention: 0,
  checkinsToReview: 0,
  programsMayAdapt: 0,
  important: 0,
};

function queueDoneKey(day = todayStr()) {
  return `prometheus_queue_done_${day}`;
}

export function loadQueueDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(queueDoneKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function saveQueueDismissed(ids: string[]) {
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

export function dropUnlinkedClient(s: {
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


/** C01 : un canal par fiche 360 ouverte (observations du client affiché). */
export const dossierChannels = new Map<string, RealtimeChannel>();

export interface CoachingState {
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
  chooseEntryIntention: (intent: 'solo' | 'find_coach' | 'coach') => Promise<{ error: string | null }>;
  setCoachingRole: (role: CoachingRole) => Promise<{ error: string | null }>;
  applyIntendedCoachingRole: () => Promise<void>;
  enableCoachMode: () => Promise<{ error: string | null }>;
  disableCoachMode: () => Promise<{ error: string | null }>;
  countActiveCoachLinks: () => Promise<{ count: number | null; error: string | null }>;
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
    bilan?: { workoutId?: string | null; checkinId?: string | null },
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
  restoreQueueItems: (ids: string[]) => void;
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
    effects: import('../../../lib/interventionEffects').InterventionEffects,
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

export type CoachingSet = StoreApi<CoachingState>['setState'];
export type CoachingGet = StoreApi<CoachingState>['getState'];

export function initialCoachingState(): Pick<
  CoachingState,
  | 'coachingRole' | 'roleReady' | 'coachingRoleError' | 'accountSnapshot' | 'accountWorkspace'
  | 'loading' | 'clients' | 'clientsFetchError' | 'invites' | 'myCoach' | 'notes' | 'opsRows'
  | 'opsLoading' | 'opsPartialError' | 'pendingInterventions' | 'sentMessages' | 'latestCoachMessage'
  | 'unreadMessageCount' | 'threadExhausted' | 'coachSettings' | 'myTrackingConfig' | 'trackingReady'
  | 'queueDismissedIds' | 'priorities' | 'rosterSignals' | 'commandStats' | 'fleetRunning'
  | 'lastFleetRound' | 'progressPhotosEpoch'
> {
  return {
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
  };
}
