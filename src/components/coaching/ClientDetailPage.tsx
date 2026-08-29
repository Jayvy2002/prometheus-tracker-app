import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  CalendarDays,
  Dumbbell,
  MessageSquare,
  Scale,
  Sparkles,
} from 'lucide-react';
import { useCoachingStore } from '../../stores/coachingStore';
import { useProgramStore } from '../../stores/programStore';
import { useAuthStore } from '../../stores/authStore';
import { formatDate, formatDuration, todayStr, addDaysToDateStr } from '../../lib/utils';
import { GOALS } from '../../lib/constants';
import { interventionHref } from '../../lib/coachInterventions';
import { isInterventionDrafting, pendingForClient } from '../../lib/coachSecond';
import { flagKindForClient, focusCheckin, parseCheckinQuery, relanceHrefForCheckin } from '../../lib/coachCheckins';
import {
  canAskCalorieAdjustment,
  detectCutCalorieStall,
  secondCaloriePrompt,
} from '../../lib/coachNutrition';
import { relanceThreadHref } from '../../lib/coachQueue';
import { displayName } from '../../lib/coachText';
import { liftsForClient } from '../../lib/coachLifts';
import { parseExerciseQuery, pickDefaultLift } from '../../lib/coachTraining';
import { clientKpis, programWeekLabel, sinceLastVisit, summarizeCheckin } from '../../lib/coachInsight';
import { shouldOpenSetup } from '../../lib/coachAlerts';
import { weightChartPoints } from '../../lib/coachProgress';
import {
  DEFAULT_COACH_VISIBLE_TABS,
  type CoachClientTab,
  type ClientLiftProgress,
  type DailyCheckin,
  type DailyNutritionPoint,
  type NutritionLog,
  type ProgressPhoto,
  type WaterLog,
  type WeightMeasurement,
  type Workout,
} from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';
import CheckinSummaryCard from './CheckinSummaryCard';
import CheckinReviewPanel from './CheckinReviewPanel';
import ClientLiftChart from './ClientLiftChart';
import ExerciseWorkspace from './ExerciseWorkspace';
import ProgressPhotoCompare from './ProgressPhotoCompare';
import NutritionStallPanel from './NutritionStallPanel';
import RemoveClientDialog from './RemoveClientDialog';
import { NutritionChart, WeightChart } from './ProgressCharts';

const TABS: CoachClientTab[] = ['overview', 'training', 'progress', 'checkins', 'health', 'notes'];

function goalLabel(goal: string): string {
  return GOALS.find(g => g.value === goal)?.label || goal || '—';
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
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    clients, fetchClients, fetchClientWorkouts, fetchClientWorkout,
    fetchClientNutrition, fetchClientWeight, fetchClientCheckins, fetchClientProfile,
    fetchClientNutritionRange, fetchClientLiftHistory, fetchProgressPhotos, signProgressPhotoUrls,
    fetchNotes, addNote, notes, opsRows, rosterSignals, fetchCoachOps,
    touchClientVisit, priorities, coachSettings, fetchCoachSettings,
    pendingInterventions, endClientLink, askSecond,
  } = useCoachingStore();
  const { fetchMyAssignment, assignment } = useProgramStore();

  const checkinId = parseCheckinQuery(searchParams.get('checkin'));
  const tab = (checkinId && !searchParams.get('tab')
    ? 'checkins'
    : (searchParams.get('tab') as CoachClientTab) || 'overview');
  const exerciseHint = parseExerciseQuery(searchParams.get('exercise'));
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [openWorkout, setOpenWorkout] = useState<Workout | null>(null);
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [water, setWater] = useState<WaterLog[]>([]);
  const [weights, setWeights] = useState<WeightMeasurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteBody, setNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [rawCheckins, setRawCheckins] = useState(false);
  const [visitAnchor, setVisitAnchor] = useState<string | null | undefined>(undefined);
  const [nutritionDays, setNutritionDays] = useState<DailyNutritionPoint[]>([]);
  const [progressLifts, setProgressLifts] = useState<ClientLiftProgress[] | null>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [askingCalories, setAskingCalories] = useState(false);

  const client = clients.find(c => c.id === id);
  const ops = opsRows.find(r => r.client.id === id);

  useEffect(() => {
    if (!id) return;
    const previous = useCoachingStore.getState().opsRows.find(r => r.client.id === id)?.client.last_visited_at
      ?? useCoachingStore.getState().clients.find(c => c.id === id)?.last_visited_at
      ?? null;
    setVisitAnchor(previous);
    if (!clients.length) fetchClients();
    if (!opsRows.length) fetchCoachOps();
    touchClientVisit(id);
    if (user) fetchMyAssignment(id);
    fetchCoachSettings();
    setLoading(true);
    const start = addDaysToDateStr(todayStr(), -27);
    Promise.all([
      fetchClientWorkouts(id).then(setWorkouts),
      fetchClientCheckins(id).then(setCheckins),
      fetchClientNutrition(id, todayStr()).then(r => { setLogs(r.logs); setWater(r.water); }),
      fetchClientWeight(id).then(setWeights),
      fetchNotes(id),
      fetchClientProfile(id).then(async profile => {
        const target = profile?.daily_calorie_target ?? 0;
        const days = await fetchClientNutritionRange(id, start, todayStr(), target);
        setNutritionDays(days);
      }),
      fetchClientLiftHistory(id).then(setProgressLifts),
      fetchProgressPhotos(id).then(async rows => {
        setPhotos(rows);
        setPhotoUrls(await signProgressPhotoUrls(rows));
      }),
    ]).finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTab = (next: CoachClientTab, extra?: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    if (next !== 'training' && next !== 'progress') params.delete('exercise');
    if (next !== 'checkins') params.delete('checkin');
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        if (v) params.set(k, v);
      }
    }
    setSearchParams(params, { replace: true });
    setOpenWorkout(null);
    setWorkspaceOpen(false);
  };

  const lifts = useMemo(() => {
    if (progressLifts && progressLifts.length > 0) return progressLifts;
    return id ? liftsForClient(rosterSignals.lifts, id) : [];
  }, [progressLifts, rosterSignals.lifts, id]);
  const visibleTabs = coachSettings?.visible_tabs?.length
    ? DEFAULT_COACH_VISIBLE_TABS.filter(tabKey => coachSettings.visible_tabs.includes(tabKey))
    : TABS;
  const workspaceLift = useMemo(
    () => (id ? pickDefaultLift(lifts, { hint: exerciseHint, notes, today: todayStr() }) : null),
    [id, lifts, exerciseHint, notes],
  );
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
  const kpis = useMemo(
    () => insight ? clientKpis(insight, checkinSummary, lifts, weights) : null,
    [insight, checkinSummary, lifts, weights],
  );
  const week = programWeekLabel(rosterSignals.assignmentStart[id ?? ''], rosterSignals.assignmentWeeks[id ?? '']);
  const clientPriorities = priorities.filter(p => p.clientId === id).slice(0, 4);
  const relanceHref = id ? relanceThreadHref(id, 'general_followup') : '';
  const trainingRelanceHref = id ? relanceThreadHref(id, 'missed_training') : '';
  const missedTraining = priorities.some(p => p.clientId === id && p.kind === 'missed_workout');
  const calorieDraft = id ? pendingForClient(pendingInterventions, id, 'calorie_adjustment') : null;
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
  const showNutritionPass = !!nutritionStall || !!calorieDraft;
  const canAskCalories = canAskCalorieAdjustment(nutritionStall) && !calorieDraft;

  const handleOpenWorkout = async (workoutId: string) => {
    const full = await fetchClientWorkout(workoutId);
    setOpenWorkout(full);
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
    const result = await askSecond({
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
    navigate('/clients');
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
      items.push({ at: w.measured_at, kind: 'weight', label: `${w.weight_kg} kg` });
    }
    for (const n of notes.slice(0, 6)) {
      items.push({ at: n.created_at, kind: 'note', label: n.body.slice(0, 80) });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  }, [workouts, insightWorkouts, checkins, weights, notes, t]);

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-8 md:px-6">
        <button onClick={() => navigate('/clients')} className="flex items-center gap-2 text-neutral-400 hover:text-white mb-4">
          <ArrowLeft size={18} /> {t('coaching.clientsTitle')}
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold">
            {client?.avatar_url
              ? <img src={client.avatar_url} alt="" className="w-full h-full object-cover" />
              : (client?.full_name?.[0] || '?').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-white truncate">{client ? displayName(client, t('coaching.unnamed')) : t('coaching.unnamed')}</h1>
            <p className="text-xs text-neutral-500 truncate">
              {ops && shouldOpenSetup(ops) ? t('coaching.badgeSetup') : t('coaching.client360.active')}
              {' · '}
              {goalLabel(client?.goal || '')}
              {week ? ` · ${t('programs.weekOf', { current: week.current, total: week.total })}` : ''}
              {client?.training_frequency ? ` · ${client.training_frequency}x` : rosterSignals.scheduledDays[id ?? ''] ? ` · ${rosterSignals.scheduledDays[id ?? '']}x` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => id && navigate(`/messages/${id}`)}
            className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-blue-400 hover:text-white"
            aria-label={t('coaching.messages.write')}
          >
            <MessageSquare size={18} />
          </button>
        </div>

        {ops && shouldOpenSetup(ops) && (
          <Button size="sm" variant="secondary" className="w-full mb-4" onClick={() => navigate(`/clients/${id}/setup`)}>
            {t('coaching.setupCta')}
          </Button>
        )}

        {id && pendingForClient(pendingInterventions, id) && (
          <button
            type="button"
            onClick={() => navigate(interventionHref(pendingForClient(pendingInterventions, id)!))}
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

        <div className="flex gap-1 overflow-x-auto mb-4 -mx-4 px-4 scrollbar-hide">
          {visibleTabs.map(key => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                tab === key ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400'
              }`}
            >
              {t(`coaching.tabs360.${key}`)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mt-8" />
        ) : tab === 'overview' ? (
          <div className="space-y-4">
            <Card>
              <p className="text-[11px] uppercase tracking-wider text-blue-300 mb-1 flex items-center gap-1">
                <Sparkles size={12} /> {t('coaching.client360.insightTitle')}
              </p>
              {insight ? (
                <>
                  <p className="text-sm text-neutral-200">
                    {t('coaching.client360.insightBody', {
                      workouts: insight.workoutsCompleted,
                      weight: insight.weightDeltaKg == null
                        ? '—'
                        : `${insight.weightDeltaKg > 0 ? '+' : ''}${insight.weightDeltaKg} kg`,
                      progressed: insight.progressed.join(', ') || t('coaching.client360.none'),
                      stalled: insight.stalled.join(', ') || t('coaching.client360.none'),
                    })}
                  </p>
                  {insight.pain != null && insight.pain >= 3 && (
                    <p className="text-xs text-rose-300 mt-2">{t('coaching.client360.painFlag', { n: insight.pain })}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-neutral-400">{t('coaching.client360.insightEmpty')}</p>
              )}
            </Card>

            <Card>
              <p className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
                {t('coaching.client360.sinceVisit')}
              </p>
              <p className="text-sm text-neutral-300">
                {insight?.since
                  ? t(`coaching.client360.sinceSource.${insight.source}`, { date: formatDate(insight.since) })
                  : t('coaching.client360.sinceUnknown')}
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                {t('coaching.client360.sinceMeta', {
                  workouts: insight?.workoutsCompleted ?? 0,
                  checkins: insight?.checkins ?? 0,
                })}
              </p>
            </Card>

            <ClientLiftChart
              compact
              lifts={lifts}
              selectedName={exerciseHint}
              notes={notes}
              relanceHref={trainingRelanceHref}
              onSelect={name => setTab('training', { exercise: name })}
            />

            {kpis && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Kpi label={t('coaching.kpis.progression')} value={progressionLabel} />
                <Kpi label={t('coaching.kpis.adherence')} value={kpis.trainingAdherence == null ? '—' : `${kpis.trainingAdherence}/5`} />
                <Kpi label={t('coaching.kpis.recovery')} value={kpis.recovery == null ? '—' : String(kpis.recovery)} />
                <Kpi
                  label={t('coaching.kpis.weight')}
                  value={kpis.weightDelta == null ? '—' : `${kpis.weightDelta > 0 ? '+' : ''}${kpis.weightDelta} kg`}
                />
                <Kpi
                  label={t('coaching.kpis.pain')}
                  value={kpis.pain == null ? '—' : `${kpis.pain}/5`}
                  tone={(kpis.pain ?? 0) >= 3 ? 'text-rose-300' : undefined}
                />
              </div>
            )}

            {clientPriorities.length > 0 && (
              <div className="space-y-2">
                {clientPriorities.map(p => (
                  <Card key={p.id} onClick={() => navigate(p.href)} className="!py-3">
                    <p className="text-sm text-white">{t(p.headlineKey, p.headlineParams)}</p>
                    <p className="text-[11px] text-neutral-500 mt-0.5">{t(p.detailKey, p.detailParams)}</p>
                  </Card>
                ))}
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">
                {t('coaching.client360.timeline')}
              </p>
              {timeline.length === 0 ? (
                <Card className="text-neutral-500 text-sm">{t('coaching.client360.timelineEmpty')}</Card>
              ) : (
                <div className="space-y-2">
                  {timeline.map((item, i) => (
                    <Card key={`${item.kind}-${item.at}-${i}`} className="flex items-center gap-3 !py-2.5">
                      {item.kind === 'workout' ? <Dumbbell size={14} className="text-blue-400" />
                        : item.kind === 'weight' ? <Scale size={14} className="text-emerald-400" />
                        : item.kind === 'note' ? <MessageSquare size={14} className="text-neutral-400" />
                        : <CalendarDays size={14} className="text-amber-300" />}
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{item.label}</p>
                        <p className="text-[11px] text-neutral-500">{formatDate(item.at)}</p>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : tab === 'training' && workspaceOpen && workspaceLift ? (
          <ExerciseWorkspace
            clientId={id!}
            lift={workspaceLift}
            onClose={() => setWorkspaceOpen(false)}
            onAsk={q => navigate(`/prometheus?q=${encodeURIComponent(q)}&client=${id}`)}
          />
        ) : tab === 'training' ? (
          openWorkout ? (
            <div className="space-y-3">
              <button onClick={() => setOpenWorkout(null)} className="text-sm text-blue-400">{t('common.back')}</button>
              <h2 className="text-lg font-semibold text-white">{openWorkout.name}</h2>
              <p className="text-xs text-neutral-500">
                {formatDate(openWorkout.date)}
                {openWorkout.duration_seconds > 0 ? ` · ${formatDuration(openWorkout.duration_seconds)}` : ''}
              </p>
              {(openWorkout.exercises ?? []).map(ex => (
                <Card
                  key={ex.id}
                  padding={false}
                  className="p-3"
                  onClick={() => setTab('training', { exercise: ex.name })}
                >
                  <p className="text-sm font-medium text-white mb-1">
                    {ex.name}
                    {ex.prescribed_sets ? (
                      <span className="text-neutral-500 font-normal"> · {ex.prescribed_sets}×{ex.prescribed_reps}</span>
                    ) : null}
                  </p>
                  {(ex.sets ?? []).map((s, i) => (
                    <p key={s.id} className="text-xs text-neutral-400">
                      {i + 1}. {s.weight_kg}kg × {s.reps}
                      {s.rir ? ` @ RIR ${s.rir}` : ''}
                    </p>
                  ))}
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <ClientLiftChart
                lifts={lifts}
                selectedName={exerciseHint}
                notes={notes}
                relanceHref={trainingRelanceHref}
                showRelance={missedTraining}
                onSelect={name => setTab('training', { exercise: name })}
                onOpenSeries={lift => {
                  setTab('training', { exercise: lift.displayName });
                  setWorkspaceOpen(true);
                }}
              />
              {assignment?.program && (
                <Card>
                  <p className="text-sm text-white">{assignment.program.name}</p>
                  <p className="text-xs text-neutral-500">
                    {week ? t('programs.weekOf', { current: week.current, total: week.total }) : t('programs.assigned')}
                  </p>
                  <button
                    type="button"
                    className="text-xs text-blue-400 mt-2"
                    onClick={() => navigate(`/programs/${assignment.program_id}`)}
                  >
                    {t('coaching.client360.openProgram')}
                  </button>
                </Card>
              )}
              {workouts.slice(0, 6).map(w => (
                <Card key={w.id} onClick={() => handleOpenWorkout(w.id)} className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${w.completed ? 'bg-blue-600/20 text-blue-400' : 'bg-neutral-800 text-neutral-500'}`}>
                    <Dumbbell size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{w.name || t('workout.title')}</p>
                    <p className="text-xs text-neutral-500">{formatDate(w.date)}</p>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : tab === 'progress' ? (
          <div className="space-y-3">
            <ClientLiftChart
              lifts={lifts}
              selectedName={exerciseHint}
              notes={notes}
              relanceHref={trainingRelanceHref}
              showRelance={missedTraining}
              onSelect={name => setTab('progress', { exercise: name })}
              onOpenSeries={lift => {
                setTab('training', { exercise: lift.displayName });
                setWorkspaceOpen(true);
              }}
            />
            <WeightChart points={weightChartPoints(weights)} />
            <NutritionChart points={nutritionDays} />
            {showNutritionPass && id && (
              <NutritionStallPanel
                relanceHref={relanceHref}
                draftHref={calorieDraft ? interventionHref(calorieDraft) : null}
                canAskSecond={canAskCalories}
                asking={askingCalories}
                liveDraft={calorieDraft}
                onAskSecond={() => { void handleAskCalories(); }}
              />
            )}
            <ProgressPhotoCompare photos={photos} urls={photoUrls} relanceHref={relanceHref} />
          </div>
        ) : tab === 'checkins' ? (
          <div className="space-y-3">
            {id && focusedCheckin ? (
              <CheckinReviewPanel
                checkin={focusedCheckin}
                previous={checkins.find(c => c.id !== focusedCheckin.id) ?? null}
                relanceHref={relanceHrefForCheckin(id, flagKindForClient(priorities, id) ?? 'unread')}
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
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-400">
                    {([
                      'energy_level', 'sleep_quality', 'stress', 'motivation', 'fatigue',
                      'mood', 'muscle_soreness', 'joint_pain', 'adherence_training', 'adherence_nutrition',
                    ] as const).map(key => (
                      <span key={key}>{t(`checkin.fields.${key}`)}: {c[key] ?? '—'}</span>
                    ))}
                  </div>
                  {c.notes && <p className="text-xs text-neutral-500 mt-2">{c.notes}</p>}
                </Card>
              ))
            )}
          </div>
        ) : tab === 'health' ? (
          <div className="space-y-3">
            <CheckinSummaryCard summary={checkinSummary} onSeeAnswers={() => setTab('checkins')} />
            <Card>
              <p className="text-xs text-neutral-500 mb-2">{t('common.today')}</p>
              <p className="text-sm text-white">
                {Math.round(logs.reduce((s, l) => s + l.calories, 0))} kcal ·
                P {Math.round(logs.reduce((s, l) => s + l.protein, 0))}g ·
                C {Math.round(logs.reduce((s, l) => s + l.carbs, 0))}g ·
                F {Math.round(logs.reduce((s, l) => s + l.fat, 0))}g
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                {t('coaching.water')}: {water.reduce((s, w) => s + w.amount_ml, 0)} ml
              </p>
            </Card>
            {weights.slice(0, 8).map(w => (
              <Card key={w.id} className="flex items-center gap-3">
                <Scale size={16} className="text-emerald-400" />
                <span className="text-sm text-white font-medium">{w.weight_kg} kg</span>
                <span className="text-xs text-neutral-500 ml-auto">{w.measured_at.slice(0, 10)}</span>
              </Card>
            ))}
            <ProgressPhotoCompare photos={photos} urls={photoUrls} relanceHref={relanceHref} />
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
        {client && user && client.id !== user.id && (
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
