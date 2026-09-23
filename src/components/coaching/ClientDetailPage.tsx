import ClientQuestionnairePanel from '../onboarding/ClientQuestionnairePanel';
import { useEffect, useMemo, useState } from 'react';
import { useClientDossier } from '../../features/coaching/hooks/useClientDossier';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  MessageSquare,
  Scale,
  Sparkles,
} from 'lucide-react';
import { useCoachingStore } from '../../stores/coachingStore';
import { useAuthStore } from '../../stores/authStore';
import { formatDate, formatWeight, formatWeightDelta, todayStr } from '../../lib/utils';
import { useProfileStore } from '../../stores/profileStore';
import { openDraftHref } from '../../lib/coachInterventions';
import { outlineFromProgram } from '../../lib/coachDraftSend';
import { isInterventionDrafting, pendingForClient } from '../../lib/coachSecond';
import { flagKindForClient, focusCheckin, formatCheckinScore, parseCheckinQuery, relanceHrefForCheckin } from '../../lib/coachCheckins';
import { isLegacyFiveScaleCheckin, PAIN_WATCH_ON_TEN, scoreOnTen } from '../../lib/checkinScale';
import {
  canAskCalorieAdjustment,
  detectCutCalorieStall,
  secondCaloriePrompt,
  shouldShowCutStallCard,
} from '../../lib/coachNutrition';
import { relanceThreadHref } from '../../lib/coachQueue';
import { lastSessionFromLifts, lastSessionFromWorkout } from '../../lib/coachLastSession';
import {
  recoverySnapshot,
  relanceHrefForRecovery,
  resolveClientTab,
} from '../../lib/coachRecovery';
import { displayName } from '../../lib/coachText';
import {
  rosterChainState,
  rosterFromLocationState,
  rosterIdsFromLocationState,
  rosterNeighbors,
} from '../../lib/coachRoster';
import { clientFileHref } from '../../lib/coachSituation';
import { liftsForClient } from '../../lib/coachLifts';
import { parseExerciseQuery, parseWorkoutQuery, pickDefaultLift } from '../../lib/coachTraining';
import { clientKpis, programWeekLabel, sinceLastVisit, summarizeCheckin } from '../../lib/coachInsight';
import {
  clientSituationLines,
  hasSessionGap,
  lastLoggedSessionDate,
  type ClientSituationLine,
} from '../../lib/coachSituation';
import { clientFileTabs, parseVisibleTabs } from '../../lib/coachSettings';
import { shouldOpenSetup } from '../../lib/coachAlerts';
import { weightChartPoints } from '../../lib/coachProgress';
import ClientProfileEditor from './ClientProfileEditor';
import {
  type CoachClientTab,
  type Workout,
} from '../../lib/types';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import TabList from '../ui/TabList';
import PrometheusWatchPanel from '../dashboard/PrometheusWatchPanel';
import { toast } from '../ui/Toast';
import CheckinSummaryCard from './CheckinSummaryCard';
import CheckinReviewPanel from './CheckinReviewPanel';
import CheckinFilledScores from '../checkin/CheckinFilledScores';
import ClientLiftChart from './ClientLiftChart';
import LastSessionReview from './LastSessionReview';
import RecoverySnapshotPanel from './RecoverySnapshotPanel';
import ExerciseWorkspace from './ExerciseWorkspace';
import ProgressPhotoCompare from './ProgressPhotoCompare';
import NutritionStallPanel from './NutritionStallPanel';
import RemoveClientDialog from './RemoveClientDialog';
import { NutritionChart, WeightChart } from './ProgressCharts';
import KinesiologyIntakeReview from '../onboarding/KinesiologyIntakeReview';
import {
  ORIGINAL_LABELS_EN,
  ORIGINAL_LABELS_FR,
  isIntakeAlreadyFilled,
  medicalFlagIds,
  parseIntake,
} from '../../lib/kinesiologyIntake';

function MedicalFlagsCard({ raw }: { raw: unknown }) {
  const { t, i18n } = useTranslation();
  const intake = parseIntake(raw);
  const flags = medicalFlagIds(intake);
  if (flags.length === 0) return null;
  const en = i18n.language.toLowerCase().startsWith('en');
  const labels = en ? ORIGINAL_LABELS_EN : ORIGINAL_LABELS_FR;
  return (
    <Card className="border-rose-500/30 bg-rose-500/5">
      <p className="text-sm font-medium text-rose-200">{t('coaching.medicalFlags.title')}</p>
      <p className="text-xs text-neutral-400 mt-0.5 mb-2">{t('coaching.medicalFlags.hint')}</p>
      <ul className="space-y-1">
        {flags.map(id => (
          <li key={id} className="text-xs text-rose-100/90">• {labels[id]}</li>
        ))}
      </ul>
      {intake.conditionMedicalePrecise.trim() && (
        <p className="text-xs text-neutral-200 mt-2 whitespace-pre-wrap">{intake.conditionMedicalePrecise}</p>
      )}
    </Card>
  );
}

function SituationCards({
  lines,
  relanceHref,
  setupHref,
}: {
  lines: ClientSituationLine[];
  relanceHref: string;
  setupHref?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (lines.length === 0) return null;
  return (
    <div className="space-y-2">
      {lines.map(line => (
        <Card key={line.id} className="space-y-3">
          <p className="text-sm text-white">{t(line.messageKey, { days: line.days ?? 0 })}</p>
          {(line.relance && relanceHref) || (line.id === 'no_program' && setupHref) ? (
            <div className="flex flex-wrap gap-2">
              {line.relance && relanceHref ? (
                <Button size="sm" onClick={() => navigate(relanceHref)}>
                  {t('coaching.queue.relance')}
                </Button>
              ) : null}
              {line.id === 'no_program' && setupHref ? (
                <Button size="sm" variant="secondary" onClick={() => navigate(setupHref)}>
                  {t('coaching.setupCta')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-neutral-900/70 px-3 py-2 min-w-0">
      <p className="text-[10px] text-neutral-500 uppercase tracking-wide truncate">{label}</p>
      <p className={`text-sm font-medium mt-0.5 truncate ${tone || 'text-white'}`}>{value}</p>
    </div>
  );
}

export default function ClientDetailPage() {
  const { t } = useTranslation();
  const unit = useProfileStore(s => s.profile?.unit_weight === 'lbs' ? 'lbs' : 'kg');
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const rosterBack = rosterFromLocationState(location.state);
  const rosterIds = rosterIdsFromLocationState(location.state);
  const chain = rosterNeighbors(rosterIds, id);
  const chainState = rosterChainState(rosterBack, rosterIds);
  const { user } = useAuthStore();
  const {
    fetchClientWorkout,
    addNote, notes, rosterSignals,
    priorities, coachSettings,
    pendingInterventions, endClientLink, askCoachAgent, createIntervention,
    adoptClientAssignment,
  } = useCoachingStore();
  const dossier = useClientDossier(id);
  const {
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
    setTracking,
    setClientProfile,
  } = dossier;

  const checkinId = parseCheckinQuery(searchParams.get('checkin'));
  const tab = resolveClientTab(searchParams.get('tab'), checkinId);
  const openNeighbor = (neighborId: string) => {
    const href = tab === 'overview'
      ? clientFileHref(neighborId)
      : `/clients/${neighborId}?tab=${encodeURIComponent(tab)}`;
    navigate(href, { state: chainState });
  };
  const exerciseHint = parseExerciseQuery(searchParams.get('exercise'));
  const workoutQuery = parseWorkoutQuery(searchParams.get('workout'));
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [openWorkout, setOpenWorkout] = useState<Workout | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [rawCheckins, setRawCheckins] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [askingCalories, setAskingCalories] = useState(false);
  const [openingProgram, setOpeningProgram] = useState(false);
  const [ficheOpen, setFicheOpen] = useState(false);
  const [adoptingId, setAdoptingId] = useState<string | null>(null);

  const setTab = (next: CoachClientTab, extra?: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    if (next !== 'training' && next !== 'progress') params.delete('exercise');
    if (next !== 'training') params.delete('workout');
    if (next !== 'checkins' && next !== 'health') params.delete('checkin');
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
    }
    setSearchParams(params, { replace: true, state: location.state });
    setWorkspaceOpen(false);
  };

  useEffect(() => {
    if (searchParams.get('tab') || checkinId) return;
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'overview');
    setSearchParams(params, { replace: true, state: location.state });
  }, [searchParams, checkinId, setSearchParams, location.state]);

  const lifts = useMemo(() => {
    if (progressLifts && progressLifts.length > 0) return progressLifts;
    return id ? liftsForClient(rosterSignals.lifts, id) : [];
  }, [progressLifts, rosterSignals.lifts, id]);
  const visibleTabs = clientFileTabs(parseVisibleTabs(coachSettings?.visible_tabs), {
    tracksNutrition: tracking.track_nutrition,
  });
  const workspaceLift = useMemo(
    () => (id ? pickDefaultLift(lifts, { hint: exerciseHint, notes, today: todayStr() }) : null),
    [id, lifts, exerciseHint, notes],
  );
  const lastFromLifts = useMemo(
    () => (id ? lastSessionFromLifts(lifts, id, { today: todayStr(), workoutId: workoutQuery || undefined }) : null),
    [id, lifts, workoutQuery],
  );
  const focusWorkoutId = workoutQuery || lastFromLifts?.workoutId || '';
  const sessionView = openWorkout && focusWorkoutId && openWorkout.id === focusWorkoutId
    ? lastSessionFromWorkout(openWorkout)
    : lastFromLifts;

  useEffect(() => {
    if (!focusWorkoutId) {
      setOpenWorkout(null);
      return;
    }
    let cancelled = false;
    fetchClientWorkout(focusWorkoutId).then(full => {
      if (!cancelled) setOpenWorkout(full);
    });
    return () => { cancelled = true; };
  }, [focusWorkoutId, fetchClientWorkout]);
  const insightWorkouts = useMemo(() => {
    if (workouts.length > 0) {
      return workouts.map(w => ({ date: w.date, completed: w.completed, name: w.name }));
    }
    const seen = new Set<string>();
    const rows: Array<{ date: string; completed: boolean; name: string }> = [];
    for (const lift of lifts) {
      for (const session of lift.sessions) {
        if (seen.has(session.workoutId)) continue;
        seen.add(session.workoutId);
        rows.push({ date: session.date, completed: true, name: session.workoutName });
      }
    }
    return rows;
  }, [workouts, lifts]);
  const insight = useMemo(() => {
    if (!ops) return null;
    const snapshot = {
      ...ops,
      client: {
        ...ops.client,
        last_visited_at: visitAnchor === undefined ? ops.client.last_visited_at : visitAnchor,
      },
    };
    return sinceLastVisit(snapshot, rosterSignals, insightWorkouts);
  }, [ops, rosterSignals, insightWorkouts, visitAnchor]);
  const checkinSummary = useMemo(() => summarizeCheckin(checkins), [checkins]);
  const focusedCheckin = useMemo(() => focusCheckin(checkins, checkinId), [checkins, checkinId]);
  const recoveryView = useMemo(
    () => recoverySnapshot(checkins, { today: todayStr(), checkinId }),
    [checkins, checkinId],
  );
  const kpis = useMemo(
    () => insight ? clientKpis(insight, checkinSummary, lifts, weights) : null,
    [insight, checkinSummary, lifts, weights],
  );
  const week = programWeekLabel(rosterSignals.assignmentStart[id ?? ''], rosterSignals.assignmentWeeks[id ?? '']);
  const clientPriorities = priorities.filter(p => p.clientId === id).slice(0, 4);
  const relanceHref = id ? relanceThreadHref(id, 'general_followup') : '';
  const trainingRelanceHref = id
    ? relanceThreadHref(id, 'missed_training', {
      workoutId: sessionView?.workoutId ?? lastFromLifts?.workoutId ?? null,
    })
    : '';
  const situation = useMemo(() => clientSituationLines({
    hasProgram: !!(ops?.hasProgram || boundAssignment?.program),
    lastSessionDate: lastLoggedSessionDate(insightWorkouts, lifts),
    today: todayStr(),
    trackWorkouts: tracking.track_workouts,
  }), [ops?.hasProgram, boundAssignment?.program, insightWorkouts, lifts, tracking.track_workouts]);
  const sessionGap = hasSessionGap(situation);
  const setupHref = id ? `/clients/${id}/setup` : undefined;
  const firstRun = !!ops && !ops.hasProgram;
  const showKpis = !!kpis && (
    kpis.progression !== 'unknown'
    || kpis.trainingAdherence != null
    || kpis.recovery != null
    || kpis.weightDelta != null
    || kpis.pain != null
  );
  const missedTraining = priorities.some(p => p.clientId === id && p.kind === 'missed_workout');
  const calorieDraft = id ? pendingForClient(pendingInterventions, id, 'calorie_adjustment') : null;
  const openableDraft = id
    ? pendingForClient(
      pendingInterventions.filter(row => !!row.id && !isInterventionDrafting(row)),
      id,
    )
    : null;
  const progressDraftHref = openDraftHref(openableDraft);
  const nutritionStall = useMemo(() => {
    if (!id || !client) return null;
    const stallWeights = weights.length > 0
      ? weights
      : rosterSignals.weights.filter(w => w.user_id === id);
    return detectCutCalorieStall({
      clientId: id,
      goal: client.goal,
      calorieTarget: rosterSignals.calorieTargets[id] ?? client.daily_calorie_target ?? 0,
      logs: rosterSignals.nutritionLogs,
      weights: stallWeights,
      today: todayStr(),
    });
  }, [id, client, rosterSignals.calorieTargets, rosterSignals.nutritionLogs, rosterSignals.weights, weights]);
  const showNutritionPass = shouldShowCutStallCard(client?.goal, nutritionStall);
  const canAskCalories = canAskCalorieAdjustment(nutritionStall) && !calorieDraft;

  const handleOpenAssignedProgram = async () => {
    if (!id || !boundAssignment?.program || openingProgram) return;
    const existing = pendingInterventions.find(
      row => row.client_id === id && row.kind === 'program_adjustment' && row.status === 'pending',
    );
    if (existing) {
      navigate(`/clients/${id}/draft/${existing.id}`);
      return;
    }
    setOpeningProgram(true);
    const outline = outlineFromProgram(boundAssignment.program);

    const result = await createIntervention({
      clientId: id,
      kind: 'program_adjustment',
      title: boundAssignment.program.name,
      rationale: t('coaching.interventions.openedFromFileRationale'),
      payload: { program: outline, name: outline.name, description: outline.description, duration_weeks: outline.duration_weeks, days: outline.days },
    });
    setOpeningProgram(false);
    if ('error' in result) {
      toast(result.error, 'error');
      return;
    }
    navigate(`/clients/${id}/draft/${result.id}`);
  };

  const handleOpenWorkout = (workoutId: string) => {
    setTab('training', { workout: workoutId });
  };

  const handleNote = async () => {
    if (!id || !noteBody.trim()) return;
    setSavingNote(true);
    const { error } = await addNote(id, noteBody, {
      noteDate: todayStr(),
      workoutId: openWorkout?.id,
    });
    setSavingNote(false);
    if (error) {
      toast(error, 'error');
      return;
    }
    setNoteBody('');
    toast(t('coaching.noteSaved'));
  };

  const handleAskCalories = async () => {
    if (!id || !client || !canAskCalories) return;
    setAskingCalories(true);
    const delta = nutritionStall
      ? (nutritionStall.weightDeltaKg > 0 ? `+${nutritionStall.weightDeltaKg}` : String(nutritionStall.weightDeltaKg))
      : '—';
    const result = await askCoachAgent({
      kind: 'calorie_adjustment',
      clientId: id,
      prompt: secondCaloriePrompt({
        name: displayName(client),
        avg: nutritionStall?.avgCalories ?? 0,
        target: nutritionStall?.calorieTarget ?? 0,
        delta,
      }),
      screen: 'client_progress',
      context: {
        avg_calories: nutritionStall?.avgCalories ?? 0,
        calorie_target: nutritionStall?.calorieTarget ?? 0,
        weight_delta: nutritionStall?.weightDeltaKg ?? 0,
        goal: client.goal,
      },
    });
    setAskingCalories(false);
    if ('error' in result) {
      toast(t('coaching.second.failed'), 'error');
    }
  };

  const handleRemoveClient = async () => {
    if (!id || !client) return;
    setRemoving(true);
    const result = await endClientLink(id);
    setRemoving(false);
    if (result.error) {
      toast(
        result.error === 'cannot_end_self'
          ? t('coaching.removeClient.cannotSelf')
          : t('coaching.removeClient.error'),
        'error',
      );
      return;
    }
    toast(t('coaching.removeClient.removed', { name: displayName(client, t('coaching.unnamed')) }));
    setRemoveOpen(false);
    navigate(rosterBack);
  };

  const progressionLabel = kpis?.progression === 'up' ? t('coaching.kpis.up')
    : kpis?.progression === 'down' ? t('coaching.kpis.down')
    : kpis?.progression === 'flat' ? t('coaching.kpis.flat')
    : t('coaching.kpis.unknown');

  const timeline = useMemo(() => {
    const items: Array<{ at: string; kind: string; label: string }> = [];
    for (const w of (workouts.length ? workouts.filter(x => x.completed) : insightWorkouts.filter(x => x.completed)).slice(0, 12)) {
      items.push({ at: w.date, kind: 'workout', label: w.name || t('workout.title') });
    }
    for (const c of checkins.slice(0, 8)) {
      items.push({ at: c.checked_at, kind: 'checkin', label: t('nav.checkin') });
    }
    for (const w of weights.slice(0, 8)) {
      items.push({ at: w.measured_at, kind: 'weight', label: formatWeight(w.weight_kg, unit) });
    }
    for (const n of notes.slice(0, 6)) {
      items.push({ at: n.created_at, kind: 'note', label: n.body.slice(0, 80) });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  }, [workouts, insightWorkouts, checkins, weights, notes, t, unit]);

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-8 md:px-6">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigate(rosterBack)} className="flex items-center gap-2 text-neutral-400 hover:text-white min-h-11">
            <ArrowLeft size={18} /> {t('coaching.clientsTitle')}
          </button>
          {chain.total > 1 && chain.index >= 0 && (
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                disabled={!chain.prevId}
                onClick={() => chain.prevId && openNeighbor(chain.prevId)}
                className="min-h-11 min-w-11 rounded-xl border border-neutral-800 text-neutral-300 disabled:opacity-30 inline-flex items-center justify-center"
                aria-label={t('coaching.client360.prevFile')}
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-xs text-neutral-500 tabular-nums px-1" aria-live="polite">
                {t('coaching.client360.filePosition', { current: chain.index + 1, total: chain.total })}
              </span>
              <button
                type="button"
                disabled={!chain.nextId}
                onClick={() => chain.nextId && openNeighbor(chain.nextId)}
                className="min-h-11 min-w-11 rounded-xl border border-neutral-800 text-neutral-300 disabled:opacity-30 inline-flex items-center justify-center"
                aria-label={t('coaching.client360.nextFile')}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold">
            {client?.avatar_url
              ? <img src={client.avatar_url} alt="" className="w-full h-full object-cover" />
              : (client?.full_name?.[0] || '?').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-xl font-bold text-white truncate">{client ? displayName(client, t('coaching.unnamed')) : t('coaching.unnamed')}</h1>
              {medicalFlagIds(parseIntake(clientProfile?.kinesiology_intake)).length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 shrink-0">
                  {t('coaching.badgeMedical')}
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 truncate">
              {ops && shouldOpenSetup(ops) ? t('coaching.badgeSetup') : t('coaching.client360.active')}
              {' · '}
              {client?.goal
                ? t(`coaching.goalLabels.${client.goal === 'gain' ? 'bulk' : client.goal === 'lose' ? 'cut' : client.goal}`, { defaultValue: client.goal })
                : '—'}
              {week ? ` · ${t('programs.weekOf', { current: week.current, total: week.total })}` : ''}
              {rosterSignals.scheduledDays[id ?? '']
                ? ` · ${rosterSignals.scheduledDays[id ?? '']}x`
                : client?.training_frequency ? ` · ${client.training_frequency}x` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => id && navigate(`/messages/${id}`)}
            className="min-h-11 min-w-11 px-3 rounded-xl bg-neutral-900 border border-neutral-800 text-blue-400 hover:text-white inline-flex items-center gap-2"
            aria-label={t('coaching.client360.message')}
          >
            <MessageSquare size={18} />
            <span className="text-sm font-medium">{t('coaching.client360.message')}</span>
          </button>
        </div>

        {dossierFetchedAt && (
          <p className="text-[11px] text-neutral-600 mb-3" role="status">
            {t('coaching.client360.updatedAt', {
              time: new Date(dossierFetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            })}
          </p>
        )}
        {loadError && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-center gap-2">
            <p className="text-xs text-amber-200 flex-1">{t('coaching.client360.loadError')}</p>
            <button
              type="button"
              onClick={() => id && void loadDossier(id)}
              className="text-xs text-amber-300 hover:text-white shrink-0"
            >
              {t('coaching.client360.retry')}
            </button>
          </div>
        )}

        {ops && shouldOpenSetup(ops) && (
          <Button size="sm" variant="secondary" className="w-full mb-4" onClick={() => navigate(`/clients/${id}/setup`)}>
            {t('coaching.setupCta')}
          </Button>
        )}

        {id && openDraftHref(pendingForClient(pendingInterventions, id)) && (
          <button
            type="button"
            onClick={() => {
              const href = openDraftHref(pendingForClient(pendingInterventions, id));
              if (href) navigate(href);
            }}
            className="w-full mb-4 text-left rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2"
          >
            <p className="text-[11px] uppercase tracking-wider text-blue-300 flex items-center gap-1">
              <Sparkles size={12} /> {t('coaching.second.badge')}
            </p>
            <p className="text-xs text-neutral-300 mt-0.5">
              {isInterventionDrafting(pendingForClient(pendingInterventions, id)!)
                ? t('coaching.second.drafting')
                : t('coaching.second.landed')}
            </p>
          </button>
        )}

        <TabList
          tabs={visibleTabs.map(key => ({ id: key, label: t(`coaching.tabs360.${key}`) }))}
          value={tab}
          onChange={setTab}
        />

        {loading ? (
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mt-8" />
        ) : tab === 'overview' ? (
          <div className="space-y-4" role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
            {firstRun && id ? (
              <Card className="space-y-3 border-blue-500/20">
                <p className="text-sm font-medium text-white">{t('coaching.client360.firstRunTitle')}</p>
                <p className="text-sm text-neutral-400">{t('coaching.client360.firstRunBody')}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => navigate(`/clients/${id}/setup`)}>
                    {t('coaching.setupCta')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/messages/${id}`)}>
                    {t('coaching.client360.message')}
                  </Button>
                </div>
              </Card>
            ) : null}

            {insight ? (
              <Card>
                <p className="text-sm font-semibold text-white mb-2">{t('coaching.client360.sinceVisit')}</p>
                {insight.since && (
                  <p className="text-sm text-neutral-400 mb-2">
                    {t(`coaching.client360.sinceSource.${insight.source}`, { date: formatDate(insight.since) })}
                  </p>
                )}
                <ul className="space-y-1 text-sm text-neutral-200">
                  <li>{t('coaching.client360.sinceMeta', { workouts: insight.workoutsCompleted, checkins: insight.checkins })}</li>
                  {kpis?.trainingAdherence != null && (
                    <li>{t('coaching.kpis.adherence')} : {formatCheckinScore(kpis.trainingAdherence)}</li>
                  )}
                  <li>
                    {insight.weightDeltaKg == null || insight.weightDeltaKg === 0
                      ? t('coaching.client360.weightStable')
                      : formatWeightDelta(insight.weightDeltaKg, unit)}
                  </li>
                  {insight.pain != null && (scoreOnTen(insight.pain, checkins[0] ? isLegacyFiveScaleCheckin(checkins[0]) : insight.pain <= 5) ?? 0) >= PAIN_WATCH_ON_TEN && (
                    <li className="text-rose-300">{t('coaching.client360.painFlag', { n: formatCheckinScore(insight.pain, checkins[0]) })}</li>
                  )}
                </ul>
              </Card>
            ) : null}

            {id ? (
              <PrometheusWatchPanel
                athleteId={id}
                viewer="coach"
                hasActiveRelationship={Boolean(client)}
              />
            ) : null}

            <SituationCards
              lines={(firstRun ? situation.filter(line => line.id !== 'no_program') : situation).slice(0, 1)}
              relanceHref={trainingRelanceHref}
              setupHref={setupHref}
            />

            {clientPriorities[0] && situation.length === 0 && (
              <Card className="space-y-3">
                <p className="text-sm text-white">{t(clientPriorities[0].headlineKey, clientPriorities[0].headlineParams)}</p>
                <p className="text-sm text-neutral-400">{t('coaching.client360.attentionOne')}</p>
                <Button size="sm" onClick={() => navigate(clientPriorities[0].href)}>
                  {t('coaching.client360.examine')}
                </Button>
              </Card>
            )}

            {isIntakeAlreadyFilled(clientProfile) ? (
              <details className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                <summary className="cursor-pointer text-sm font-medium text-white min-h-11 flex items-center">
                  {t('coaching.client360.intakeSummary')}
                </summary>
                <div className="mt-3 space-y-4">
                  <MedicalFlagsCard raw={clientProfile?.kinesiology_intake} />
                  <KinesiologyIntakeReview raw={clientProfile?.kinesiology_intake} />
                </div>
              </details>
            ) : null}
            {id && (
              <details className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                <summary className="cursor-pointer text-sm font-medium text-white min-h-11 flex items-center">
                  {t('coaching.client360.questionnaire')}
                </summary>
                <div className="mt-3">
                  <ClientQuestionnairePanel key={id} clientId={id} emptyFallback={
                    isIntakeAlreadyFilled(clientProfile) ? null : (
                      <Card className="border-amber-500/20">
                        <p className="text-sm text-amber-200">{t('intake.waiting')}</p>
                      </Card>
                    )
                  }/>
                </div>
              </details>
            )}

            <details className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <summary className="cursor-pointer text-sm font-medium text-white min-h-11 flex items-center">
                {t('coaching.client360.moreDetails')}
              </summary>
              <div className="mt-4 space-y-4">
                {!sessionGap && tracking.track_workouts && (
                  <ClientLiftChart
                    compact
                    lifts={lifts}
                    selectedName={exerciseHint}
                    notes={notes}
                    relanceHref={trainingRelanceHref}
                    onSelect={name => setTab('training', { exercise: name })}
                  />
                )}

                {showKpis && kpis && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <Kpi label={t('coaching.kpis.progression')} value={progressionLabel} />
                    <Kpi label={t('coaching.kpis.adherence')} value={formatCheckinScore(kpis.trainingAdherence)} />
                    <Kpi label={t('coaching.kpis.recovery')} value={kpis.recovery == null ? '—' : formatCheckinScore(kpis.recovery)} />
                    <Kpi
                      label={t('coaching.kpis.weight')}
                      value={kpis.weightDelta == null ? '—' : formatWeightDelta(kpis.weightDelta, unit)}
                    />
                    <Kpi
                      label={t('coaching.kpis.pain')}
                      value={formatCheckinScore(kpis.pain, checkins[0])}
                      tone={(scoreOnTen(kpis.pain, checkins[0] ? isLegacyFiveScaleCheckin(checkins[0]) : (kpis.pain ?? 0) <= 5) ?? 0) >= PAIN_WATCH_ON_TEN ? 'text-rose-300' : undefined}
                    />
                  </div>
                )}

                {timeline.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">
                      {t('coaching.client360.timeline')}
                    </p>
                    <div className="space-y-2">
                      {timeline.map((item, i) => (
                        <Card key={`${item.kind}-${item.at}-${i}`} className="flex items-center gap-3 !py-2.5">
                          {item.kind === 'workout' ? <Dumbbell size={14} className="text-blue-400" />
                            : item.kind === 'weight' ? <Scale size={14} className="text-emerald-400" />
                            : item.kind === 'note' ? <MessageSquare size={14} className="text-neutral-400" />
                            : <CalendarDays size={14} className="text-amber-300" />}
                          <div className="min-w-0">
                            <p className="text-sm text-white truncate">{item.label}</p>
                            <p className="text-xs text-neutral-500">{formatDate(item.at)}</p>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </details>

            {id ? (
              <Card>
                <button
                  type="button"
                  onClick={() => setFicheOpen(v => !v)}
                  className="w-full text-left flex items-center justify-between"
                >
                  <p className="text-sm font-medium text-white">{t('coaching.tabs360.profile')}</p>
                  <span className="text-xs text-blue-400">{ficheOpen ? t('common.close') : t('common.details')}</span>
                </button>
                {ficheOpen && (
                  <div className="mt-4 border-t border-neutral-800 pt-4">
                    <ClientProfileEditor
                      clientId={id}
                      profile={clientProfile}
                      tracking={tracking}
                      onTrackingChange={setTracking}
                      onSaved={setClientProfile}
                    />
                  </div>
                )}
              </Card>
            ) : null}
          </div>
        ) : tab === 'training' && workspaceOpen && workspaceLift ? (
          <ExerciseWorkspace
            clientId={id!}
            lift={workspaceLift}
            onClose={() => setWorkspaceOpen(false)}
            onAsk={q => navigate(`/prometheus?q=${encodeURIComponent(q)}&client=${id}`)}
          />
        ) : tab === 'training' ? (
            <div className="space-y-3">
              <SituationCards
                lines={situation}
                relanceHref={trainingRelanceHref}
                setupHref={setupHref}
              />
              {sessionView && id ? (
                <LastSessionReview
                  clientId={id}
                  client={client}
                  session={sessionView}
                  relanceHref={trainingRelanceHref}
                  showRelance
                  onExercise={name => setTab('training', { exercise: name })}
                />
              ) : null}
              {!sessionGap && tracking.track_workouts && (
                <ClientLiftChart
                  lifts={lifts}
                  selectedName={exerciseHint}
                  notes={notes}
                  relanceHref={trainingRelanceHref}
                  showRelance={missedTraining && !sessionView}
                  onSelect={name => setTab('training', { exercise: name })}
                  onOpenSeries={lift => {
                    setTab('training', { exercise: lift.displayName });
                    setWorkspaceOpen(true);
                  }}
                />
              )}
              {workouts.filter(w => w.id !== sessionView?.workoutId).slice(0, 6).length > 0 && (
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest pt-1">
                  {t('coaching.lastSession.older')}
                </p>
              )}
              {workouts.filter(w => w.id !== sessionView?.workoutId).slice(0, 6).map(w => (
                <Card key={w.id} padding={false}>
                  <button
                    type="button"
                    onClick={() => handleOpenWorkout(w.id)}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${w.completed ? 'bg-blue-600/20 text-blue-400' : 'bg-neutral-800 text-neutral-500'}`}>
                    <Dumbbell size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{w.name || t('workout.title')}</p>
                    <p className="text-xs text-neutral-500">{formatDate(w.date)}</p>
                  </div>
                  </button>
                </Card>
              ))}
            </div>
        ) : tab === 'program' ? (
          <div className="space-y-3" role="tabpanel" id="panel-program" aria-labelledby="tab-program">
            {boundAssignment?.program ? (
              <Card className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{boundAssignment.program.name}</p>
                    <p className="text-xs text-neutral-500">
                      {week ? t('programs.weekOf', { current: week.current, total: week.total }) : t('programs.assigned')}
                    </p>
                  </div>
                </div>
                {(boundAssignment.program.days ?? []).length > 0 && (
                  <ul className="divide-y divide-neutral-800/60">
                    {[...(boundAssignment.program.days ?? [])]
                      .sort((a, b) => a.order_index - b.order_index)
                      .map(day => (
                        <li key={day.id} className="py-2">
                          <p className="text-sm text-white">{day.name}</p>
                          {(day.exercises ?? []).length > 0 && (
                            <p className="text-xs text-neutral-500 truncate">
                              {(day.exercises ?? []).map(ex => ex.name).join(' · ')}
                            </p>
                          )}
                        </li>
                      ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => { void handleOpenAssignedProgram(); }}
                    disabled={openingProgram}
                  >
                    {t('coaching.client360.openProgram')}
                  </Button>
                  {setupHref && (
                    <Button size="sm" variant="ghost" onClick={() => navigate(setupHref)}>
                      {t('coaching.client360.changeProgram')}
                    </Button>
                  )}
                </div>
              </Card>
            ) : (
              <EmptyState
                title={t('coaching.client360.noProgramTitle')}
                body={t('coaching.client360.noProgramBody')}
                action={setupHref ? (
                  <Button size="sm" onClick={() => navigate(setupHref)}>{t('coaching.setupCta')}</Button>
                ) : undefined}
              />
            )}
            {assignmentHistory.length > 0 && (
                          <Card className="space-y-2">
                            <p className="text-[11px] uppercase tracking-wider text-neutral-500">
                              {t('coaching.client360.historyTitle')}
                            </p>
                            {assignmentHistory.map(a => (
                              <div key={a.id} className="flex items-center gap-2 py-1 border-b border-neutral-800/60 last:border-0">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-white truncate">
                                    {(a as { programs?: { name: string } | null }).programs?.name || t('programs.assigned')}
                                  </p>
                                  <p className="text-[11px] text-neutral-500">
                                    {a.status === 'active'
                                      ? t('coaching.client360.historyActive')
                                      : t('coaching.client360.historyPaused')}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  disabled={adoptingId === a.id}
                                  onClick={() => void (async () => {
                                    setAdoptingId(a.id);
                                    const result = await adoptClientAssignment(a.id);
                                    setAdoptingId(null);
                                    if ('error' in result) toast(result.error, 'error');
                                    else toast(t('coaching.client360.historyAdopted'));
                                  })()}
                                  className="text-xs text-blue-400 hover:text-white shrink-0 disabled:opacity-50"
                                >
                                  {t('coaching.client360.historyAdopt')}
                                </button>
                              </div>
                            ))}
                          </Card>
                        )}
          </div>
        ) : tab === 'nutrition' ? (
          <div className="space-y-3" role="tabpanel" id="panel-nutrition" aria-labelledby="tab-nutrition">
            {clientProfile?.daily_calorie_target ? (
              <Card className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Kpi label={t('common.calories')} value={String(clientProfile.daily_calorie_target)} />
                <Kpi label={t('common.protein')} value={clientProfile.protein_target ? `${clientProfile.protein_target} g` : '—'} />
                <Kpi label={t('common.carbs')} value={clientProfile.carbs_target ? `${clientProfile.carbs_target} g` : '—'} />
                <Kpi label={t('common.fat')} value={clientProfile.fat_target ? `${clientProfile.fat_target} g` : '—'} />
              </Card>
            ) : null}
            <NutritionChart points={nutritionDays} />
            {showNutritionPass && id && (
              <NutritionStallPanel
                relanceHref={relanceHref}
                draftHref={progressDraftHref}
                canAskAgent={false}
                asking={askingCalories}
                liveDraft={pendingForClient(pendingInterventions, id, 'adherence_nutrition') ?? calorieDraft}
                onAskAgent={() => { void handleAskCalories(); }}
              />
            )}
          </div>
        ) : tab === 'progress' ? (
          <div className="space-y-3">
            {!sessionGap && tracking.track_workouts && (
              <ClientLiftChart
                compact
                lifts={lifts}
                selectedName={exerciseHint}
                notes={notes}
                relanceHref={trainingRelanceHref}
                onSelect={name => setTab('training', { exercise: name })}
              />
            )}
            <WeightChart points={weightChartPoints(weights)} />
            <p className="text-sm text-neutral-500">{t('coaching.photos.coachSeesHistory')}</p>
            {photos.length > 0 ? (
              <ProgressPhotoCompare photos={photos} urls={photoUrls} relanceHref={relanceHref} />
            ) : (
              <p className="text-sm text-neutral-500">{t('coaching.photos.emptyCoach')}</p>
            )}
          </div>
        ) : tab === 'checkins' ? (
          <div className="space-y-3">
            {id && focusedCheckin ? (
              <CheckinReviewPanel
                checkin={focusedCheckin}
                previous={checkins.find(c => c.id !== focusedCheckin.id) ?? null}
                relanceHref={relanceHrefForCheckin(id, flagKindForClient(priorities, id) ?? 'unread', focusedCheckin.id)}
                savingNote={savingNote}
                onSaveNote={async body => {
                  const { error } = await addNote(id, body, { noteDate: focusedCheckin.checked_at });
                  if (error) {
                    toast(error, 'error');
                    return;
                  }
                  toast(t('coaching.checkinReview.noteSaved'));
                }}
              />
            ) : (
              <CheckinSummaryCard summary={checkinSummary} onSeeAnswers={() => setRawCheckins(true)} />
            )}
            {checkins.length > 0 && (
              <button
                type="button"
                onClick={() => setRawCheckins(v => !v)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {rawCheckins ? t('coaching.checkin.summaryTitle') : t('coaching.checkinReview.history')}
              </button>
            )}
            {rawCheckins && (
              checkins.length === 0 ? (
                <Card className="text-center py-8 text-neutral-500">{t('coaching.empty.checkins')}</Card>
              ) : checkins.map(c => (
                <Card key={c.id}>
                  <p className="text-sm font-medium text-white mb-2">{c.checked_at}</p>
                  <CheckinFilledScores row={c} />
                  {c.notes && <p className="text-xs text-neutral-500 mt-2">{c.notes}</p>}
                </Card>
              ))
            )}
          </div>
        ) : tab === 'health' ? (
          <div className="space-y-3">
            {id && recoveryView ? (
              <RecoverySnapshotPanel
                clientId={id}
                client={client}
                snapshot={recoveryView}
                relanceHref={relanceHrefForRecovery(id, true, recoveryView.checkin.id)}
              />
            ) : (
              <Card className="space-y-3">
                <p className="text-[11px] uppercase tracking-wider text-rose-300">{t('coaching.recovery.title')}</p>
                <p className="text-sm text-neutral-300">{t('coaching.recovery.empty')}</p>
                {id ? (
                  <Button size="sm" onClick={() => navigate(relanceHrefForRecovery(id, false))}>
                    {t('coaching.queue.relance')}
                  </Button>
                ) : null}
              </Card>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={noteBody}
                onChange={e => setNoteBody(e.target.value)}
                placeholder={t('coaching.noteOnDay')}
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
              />
              <Button size="sm" onClick={handleNote} loading={savingNote}>{t('common.send')}</Button>
            </div>
            {notes.length === 0 ? (
              <Card className="text-center py-8 text-neutral-500">{t('coaching.empty.notes')}</Card>
            ) : notes.map(n => (
              <Card key={n.id}>
                <div className="flex items-center gap-2 mb-1">
                  {n.workout_id ? <Dumbbell size={12} className="text-blue-400" /> : <CalendarDays size={12} className="text-neutral-500" />}
                  <span className="text-[10px] text-neutral-500">{n.note_date || n.created_at.slice(0, 10)}</span>
                </div>
                <p className="text-sm text-neutral-200">{n.body}</p>
              </Card>
            ))}
          </div>
        )}
        {!loading && client && user && client.id !== user.id && (
          <div className="mt-8 pt-6 border-t border-neutral-800/80">
            <button
              type="button"
              onClick={() => setRemoveOpen(true)}
              className="text-xs text-neutral-600 hover:text-rose-400"
            >
              {t('coaching.removeClient.action')}
            </button>
          </div>
        )}
        <RemoveClientDialog
          open={removeOpen}
          clientName={client ? displayName(client, t('coaching.unnamed')) : ''}
          removing={removing}
          onClose={() => setRemoveOpen(false)}
          onConfirm={handleRemoveClient}
        />
      </div>
    </PageTransition>
  );
}
