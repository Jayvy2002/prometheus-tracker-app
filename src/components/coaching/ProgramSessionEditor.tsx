import { useEffect, useMemo, useState } from 'react';
import { useProgramEditorTracking } from '../../features/programs/hooks/useProgramEditorTracking';
import { useProgramNlEdit } from '../../features/programs/hooks/useProgramNlEdit';
import { useTranslation } from 'react-i18next';
import { ChevronDown, GripVertical, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { AiProgramDayDraft, Exercise, ProgramExerciseDraft, SessionOrganization } from '../../lib/types';
import type { ProgramPhaseDraft } from '../../features/programs/domain/programPhases';
import { newPhaseDraft, PROGRAM_EXERCISE_MAX_SETS } from '../../features/programs/domain/programPhases';
import {
  formatExercisePrescription,
  repsInputMode,
  showTrainingField,
} from '../../lib/clientTracking';
import { muscleForExercise, sessionMuscleVolume, volumeWarnings, weekMuscleVolume, type MuscleVolume } from '../../lib/programVolume';
import { muscleLabel } from '../../lib/muscleLabels';
import { useExerciseStore } from '../../stores/exerciseStore';
import { interventionDraftError, isInterventionDrafting } from '../../lib/coachSecond';
import { nextProgramWeekday } from '../../lib/kinesiologyIntake';
import { namedSessionLine } from '../../features/programs/domain/namedSession';
import { normalizeSessionOrganization, sessionOrderLetter } from '../../features/programs/domain/sessionOrganization';
import ExercisePicker from '../workout/ExercisePicker';
import AgentDraftingCard from './AgentDraftingCard';
import Button from '../ui/Button';
import { SET_TYPES } from '../../lib/constants';
import { optionLabel } from '../../lib/optionLabels';
import { PROGRAM_SET_TYPES } from '../../lib/programSetPrescription';
import Card from '../ui/Card';
import Input from '../ui/Input';
import OverflowMenu, { type OverflowAction } from '../ui/OverflowMenu';
import { exerciseSummaryParts } from '../../features/programs/domain/programExerciseSummary';
import {
  isLinkedToNext,
  isLinkedToPrevious,
  linkWithNext,
  removeFromSuperset,
  supersetGroupOf,
  supersetPartners,
  unlinkFromNext,
} from '../../features/programs/domain/programSupersets';
import { useExerciseDisplayName } from '../../features/workout/hooks/useExerciseDisplayName';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

interface Props {
  name: string;
  description: string;
  durationWeeks: number;
  days: AiProgramDayDraft[];
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onWeeksChange: (value: number) => void;
  onDaysChange: (days: AiProgramDayDraft[]) => void;
  onAnalyze?: (exerciseName: string) => void;
  onAsk?: (query: string) => void;
  clientId?: string | null;
  programId?: string | null;
  presentation?: 'coach' | 'athlete';
  currentWeek?: number | null;
  /** Intake joursDispo as JS weekday ints; next added day prefers these. */
  preferredWeekdays?: number[];
  sessionOrganization?: SessionOrganization;
  onSessionOrganizationChange?: (value: SessionOrganization) => void;
  phases?: ProgramPhaseDraft[];
  onPhasesChange?: (phases: ProgramPhaseDraft[]) => void;
}

/** A hold prescribed without a duration still starts with one the coach can change. */
const DEFAULT_ISOMETRIC_SECONDS = 30;

function emptyDay(weekday: number | null): AiProgramDayDraft {
  return { weekday, name: '', exercises: [] };
}

function emptyEx(): ProgramExerciseDraft {
  return {
    name: '',
    default_sets: 3,
    default_reps: 10,
    default_reps_min: 6,
    default_rir: 2,
    default_rest_seconds: 90,
    set_type: 'working',
    superset_group: '',
    drop_count: 2,
    tempo: '',
    isometric_seconds: null,
    cluster_rest_seconds: 20,
    cluster_reps_per_burst: null,
    myo_activation: false,
  };
}

export default function ProgramSessionEditor({
  name, description, durationWeeks, days,
  onNameChange, onDescriptionChange, onWeeksChange, onDaysChange,
  onAnalyze, onAsk, clientId, programId,
  presentation = 'coach',
  currentWeek = null,
  preferredWeekdays = [],
  sessionOrganization = 'fixed_days',
  onSessionOrganizationChange,
  phases = [],
  onPhasesChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const exerciseName = useExerciseDisplayName();
  const athlete = presentation === 'athlete';
  const exercisesLib = useExerciseStore(s => s.exercises);
  const fetchExercises = useExerciseStore(s => s.fetchExercises);
  const tracking = useProgramEditorTracking(clientId);
  const [dayIndex, setDayIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [analyzed, setAnalyzed] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'add' | 'replace'>('add');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const {
    nl,
    setNl,
    nlError,
    setNlError,
    proposal,
    nlRow,
    nlSending,
    proposalResolving,
    requestNl,
    dismissProposal,
    applyProposal,
  } = useProgramNlEdit({
    name,
    description,
    durationWeeks,
    days,
    onDaysChange,
    clientId,
    programId,
    onApplied: (nextDay, nextEx) => {
      setDayIndex(nextDay);
      setSelected(nextEx);
    },
  });

  const safeIndex = Math.min(dayIndex, Math.max(0, days.length - 1));
  const day = days[safeIndex];
  const todayWeekday = new Date().getDay();
  const trainingCount = days.filter(d => d.exercises.some(ex => ex.name.trim())).length;
  const weekdayKey = days.map(d => d.weekday).join(',');
  const organization = normalizeSessionOrganization(sessionOrganization);
  const inOrder = organization === 'in_order';

  useEffect(() => {
    if (!athlete || inOrder || days.length === 0) return;
    const idx = days.findIndex(d => d.weekday === todayWeekday);
    if (idx >= 0) setDayIndex(idx);
  }, [athlete, inOrder, weekdayKey, todayWeekday]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void fetchExercises();
  }, [fetchExercises]);

  const volumes = useMemo(
    () => (day ? sessionMuscleVolume(day.exercises, exercisesLib) : []),
    [day, exercisesLib],
  );
  const weekVol = useMemo(() => weekMuscleVolume(days, exercisesLib), [days, exercisesLib]);
  const warnings = volumeWarnings(volumes);

  const updateDay = (index: number, patch: Partial<AiProgramDayDraft>) => {
    onDaysChange(days.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const updateExercise = (exIndex: number, patch: Partial<ProgramExerciseDraft>) => {
    if (!day) return;
    updateDay(safeIndex, {
      exercises: day.exercises.map((ex, j) => (j === exIndex ? { ...ex, ...patch } : ex)),
    });
  };

  const reorder = (from: number, to: number) => {
    if (!day || from === to) return;
    const next = [...day.exercises];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateDay(safeIndex, { exercises: next });
    setSelected(to);
  };

  const nextWeekday = () => nextProgramWeekday(
    days.map(d => d.weekday).filter((value): value is number => typeof value === 'number'),
    preferredWeekdays,
  );

  const setOrganization = (next: SessionOrganization) => {
    if (!onSessionOrganizationChange || next === organization) return;
    onSessionOrganizationChange(next);
    if (next === 'in_order') {
      onDaysChange(days.map(d => ({ ...d, weekday: null })));
      return;
    }
    const used: number[] = [];
    onDaysChange(days.map(d => {
      if (typeof d.weekday === 'number' && !used.includes(d.weekday)) {
        used.push(d.weekday);
        return d;
      }
      const weekday = nextProgramWeekday(used, preferredWeekdays);
      used.push(weekday);
      return { ...d, weekday };
    }));
  };

  return (
    <div className="space-y-3">
      {athlete ? (
        <div className="rounded-2xl border border-blue-500/25 bg-gradient-to-br from-blue-600/20 via-blue-500/5 to-transparent p-4">
          {currentWeek != null && (
            <p className="text-[11px] font-medium uppercase tracking-widest text-blue-300">
              {t('programs.weekOf', { current: currentWeek, total: durationWeeks })}
            </p>
          )}
          <h2 className="text-xl font-bold text-white mt-0.5 truncate">{name.trim() || t('programs.mineTitle')}</h2>
          <p className="text-xs text-neutral-400 mt-1">
            {t('programs.splitLabel', { n: trainingCount })}
            {days.length > 0
              ? ` · ${days.map((d, i) => inOrder
                ? (d.name.trim() || t('programs.sessionLetter', { letter: sessionOrderLetter(i) }))
                : t(`programs.weekdays.${d.weekday ?? 1}`)
              ).join(' · ')}`
              : ''}
          </p>
          {currentWeek != null && durationWeeks > 0 && (
            <div className="flex gap-1 mt-3">
              {Array.from({ length: durationWeeks }, (_, i) => i + 1).map(n => (
                <span
                  key={n}
                  className={`h-1.5 flex-1 rounded-full ${n === currentWeek ? 'bg-blue-500' : n < currentWeek ? 'bg-blue-500/40' : 'bg-white/10'}`}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_88px] gap-2" data-testid="ux22-cycle-fields">
          <Input label={t('programs.name')} value={name} onChange={e => onNameChange(e.target.value)} />
          <Input
            label={t('programs.durationWeeks')}
            type="number"
            value={durationWeeks}
            onChange={e => onWeeksChange(Math.max(1, Math.min(52, +e.target.value || 8)))}
          />
        </div>
      )}

      {athlete ? (
        <details className="group rounded-2xl border border-neutral-800 bg-neutral-900/40 px-3 py-2" data-testid="ux22-cycle-fields">
          <summary className="flex items-center justify-between cursor-pointer list-none text-sm text-neutral-300">
            {t('programs.cycleDetails')}
            <ChevronDown size={16} className="text-neutral-500 group-open:rotate-180 transition-transform" />
          </summary>
          <div className="mt-3 space-y-2 pb-1">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_88px] gap-2">
              <Input label={t('programs.name')} value={name} onChange={e => onNameChange(e.target.value)} />
              <Input
                label={t('programs.durationWeeks')}
                type="number"
                value={durationWeeks}
                onChange={e => onWeeksChange(Math.max(1, Math.min(52, +e.target.value || 8)))}
              />
            </div>
            <Input
              label={t('programs.description')}
              value={description}
              onChange={e => onDescriptionChange(e.target.value)}
            />
          </div>
        </details>
      ) : (
        <Input
          label={t('programs.description')}
          value={description}
          onChange={e => onDescriptionChange(e.target.value)}
        />
      )}

      {onSessionOrganizationChange && (
        <fieldset className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3 space-y-2" data-testid="session-organization">
          <legend className="text-sm font-medium text-white px-1">{t('programs.organizationTitle')}</legend>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="session-organization"
              className="mt-1"
              checked={!inOrder}
              onChange={() => setOrganization('fixed_days')}
            />
            <span>
              <span className="block text-sm text-white">{t('programs.organizationFixed')}</span>
              <span className="block text-[11px] text-neutral-500">{t('programs.organizationFixedHint')}</span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="session-organization"
              className="mt-1"
              checked={inOrder}
              onChange={() => setOrganization('in_order')}
            />
            <span>
              <span className="block text-sm text-white">{t('programs.organizationInOrder')}</span>
              <span className="block text-[11px] text-neutral-500">{t('programs.organizationInOrderHint')}</span>
            </span>
          </label>
        </fieldset>
      )}

      {onPhasesChange && (
        <details className="group rounded-2xl border border-neutral-800 bg-neutral-900/40 px-3 py-2" data-testid="program-phases-advanced">
          <summary className="flex items-center justify-between cursor-pointer list-none text-sm text-neutral-300">
            {t('programs.phasesAdvanced')}
            <ChevronDown size={16} className="text-neutral-500 group-open:rotate-180 transition-transform" />
          </summary>
          <p className="text-[11px] text-neutral-500 mt-2">{t('programs.phasesHint')}</p>
          <div className="mt-3 space-y-2">
            {phases.map((phase, index) => (
              <div key={phase.id ?? `phase-${index}`} className="grid grid-cols-[1fr_72px_32px] gap-2 items-end">
                <Input
                  label={index === 0 ? t('programs.phaseName') : undefined}
                  value={phase.name}
                  onChange={e => onPhasesChange(phases.map((row, i) => i === index ? { ...row, name: e.target.value } : row))}
                />
                <Input
                  label={index === 0 ? t('programs.phaseWeeks') : undefined}
                  type="number"
                  value={phase.duration_weeks ?? ''}
                  onChange={e => {
                    const raw = e.target.value;
                    const weeks = raw === '' ? null : Math.max(1, Math.min(52, Number(raw) || 1));
                    onPhasesChange(phases.map((row, i) => i === index ? { ...row, duration_weeks: weeks } : row));
                  }}
                />
                <button
                  type="button"
                  className="h-10 text-neutral-500 hover:text-red-400"
                  onClick={() => {
                    const removed = phases[index]?.id;
                    onPhasesChange(phases.filter((_, i) => i !== index));
                    if (removed) {
                      onDaysChange(days.map(d => d.phase_id === removed ? { ...d, phase_id: null } : d));
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-xs text-blue-400"
              onClick={() => onPhasesChange([...phases, newPhaseDraft('')])}
            >
              + {t('programs.addPhase')}
            </button>
          </div>
        </details>
      )}

      {athlete ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3">
          <p className="text-[11px] font-medium text-blue-300 flex items-center gap-1.5">
            <Sparkles size={12} /> {t('programs.askCopilot')}
          </p>
          <p className="text-[11px] text-neutral-500 mt-0.5 mb-2">{t('programs.askCopilotHint')}</p>
          <form onSubmit={e => { e.preventDefault(); void requestNl(); }} className="flex gap-2">
            <input
              value={nl}
              onChange={e => { setNl(e.target.value); setNlError(null); }}
              placeholder={t('programs.askCopilotPlaceholder')}
              className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white"
            />
            <Button type="submit" size="sm" variant="secondary" loading={nlSending}>{t('coaching.programNl.propose')}</Button>
          </form>
        </div>
      ) : (
        <form
          onSubmit={e => { e.preventDefault(); void requestNl(); }}
          className="flex gap-2"
        >
          <input
            value={nl}
            onChange={e => { setNl(e.target.value); setNlError(null); }}
            placeholder={t('coaching.programNl.placeholder')}
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white"
          />
          <Button type="submit" size="sm" variant="secondary" loading={nlSending}>{t('coaching.programNl.propose')}</Button>
        </form>
      )}
      {nlError && <p className="text-[11px] text-amber-300 -mt-1">{nlError}</p>}
      {nlRow && (isInterventionDrafting(nlRow) || interventionDraftError(nlRow)) && (
        <AgentDraftingCard
          row={nlRow}
          retrying={nlSending}
          onRetry={interventionDraftError(nlRow) ? () => void requestNl() : undefined}
        />
      )}

      {proposal && (
        <Card className="border-blue-500/20 space-y-2">
          <p className="text-xs text-blue-300">{t('coaching.programNl.proposal')}</p>
          <p className="text-sm text-neutral-200">{t(proposal.summaryKey, proposal.summaryParams)}</p>
          <p className="text-[11px] text-neutral-500">
            {proposal.before ? formatExercisePrescription(proposal.before, tracking) : '—'}
            {' → '}
            {formatExercisePrescription(proposal.after, tracking)}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" loading={proposalResolving} onClick={() => void dismissProposal()}>{t('common.cancel')}</Button>
            <Button
              size="sm"
              loading={proposalResolving}
              onClick={() => void applyProposal()}
            >
              {t('common.apply')}
            </Button>
          </div>
        </Card>
      )}

      <div className={`flex gap-1.5 overflow-x-auto scrollbar-hide ${athlete ? 'pb-0.5' : ''}`}>
        {days.map((d, i) => {
          const count = d.exercises.filter(ex => ex.name.trim()).length;
          const isToday = !inOrder && d.weekday === todayWeekday;
          const active = i === safeIndex;
          const tabLabel = inOrder
            ? t('programs.sessionLetter', { letter: sessionOrderLetter(i) })
            : t(`programs.weekdays.${d.weekday ?? 1}`);
          if (athlete) {
            return (
              <button
                key={`day-tab-${i}`}
                type="button"
                onClick={() => { setDayIndex(i); setSelected(null); setAnalyzed(null); }}
                className={`min-w-[4.75rem] shrink-0 rounded-2xl border px-2.5 py-2.5 text-left transition-colors ${
                  active
                    ? 'border-blue-500 bg-blue-500/15'
                    : isToday
                      ? 'border-blue-500/35 bg-neutral-900'
                      : 'border-neutral-800 bg-neutral-900/70'
                }`}
              >
                <p className={`text-[11px] font-semibold uppercase tracking-wider ${active || isToday ? 'text-blue-300' : 'text-neutral-500'}`}>
                  {tabLabel}
                  {isToday ? ` · ${t('programs.todayBadge')}` : ''}
                </p>
                <p className="text-xs font-semibold text-white truncate mt-0.5" data-testid={active || isToday ? 'ux22-session-label' : undefined}>
                  {d.name.trim() || t('programs.sessionFallback')}
                </p>
                <p className="text-[11px] text-neutral-500 mt-0.5">{t('programs.sessionLifts', { n: count })}</p>
              </button>
            );
          }
          return (
            <button
              key={`day-tab-${i}`}
              type="button"
              onClick={() => { setDayIndex(i); setSelected(null); setAnalyzed(null); }}
              className={`min-h-11 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${
                active ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400'
              }`}
            >
              {inOrder
                ? namedSessionLine(tabLabel, d.name)
                : namedSessionLine(t(`programs.weekdays.${d.weekday ?? 1}`), d.name)}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            onDaysChange([...days, emptyDay(inOrder ? null : nextWeekday())]);
            setDayIndex(days.length);
          }}
          className={`shrink-0 text-xs text-blue-400 bg-neutral-900 ${
            athlete ? 'min-w-[4.75rem] rounded-2xl border border-dashed border-neutral-700 px-2.5 py-2.5' : 'min-h-11 px-3 py-1.5 rounded-lg'
          }`}
        >
          + {t('coaching.interventions.addDay')}
        </button>
      </div>

      {day && (
        <div className={`space-y-3 ${athlete ? 'rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3' : 'rounded-xl border border-neutral-800 p-3 space-y-2'}`}>
          <div className="flex items-center gap-2">
            {!inOrder && (
              <select
                value={day.weekday ?? 1}
                onChange={e => updateDay(safeIndex, { weekday: Number(e.target.value) })}
                className="bg-neutral-900 border border-neutral-800 rounded-xl px-2 py-2 text-xs text-white"
              >
                {WEEKDAYS.map(w => (
                  <option key={w} value={w}>{t(`programs.weekdays.${w}`)}</option>
                ))}
              </select>
            )}
            {inOrder && (
              <span className="text-xs font-semibold text-blue-300 px-1">
                {t('programs.sessionLetter', { letter: sessionOrderLetter(safeIndex) })}
              </span>
            )}
            <input
              value={day.name}
              onChange={e => updateDay(safeIndex, { name: e.target.value })}
              placeholder={t('coaching.interventions.sessionName')}
              className={athlete
                ? 'flex-1 bg-transparent outline-none text-white text-base font-semibold'
                : 'flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white'}
            />
            {onPhasesChange && phases.length > 0 && (
              <select
                value={day.phase_id ?? ''}
                onChange={e => updateDay(safeIndex, { phase_id: e.target.value || null })}
                className="bg-neutral-900 border border-neutral-800 rounded-xl px-2 py-2 text-xs text-white max-w-[9rem]"
                data-testid="program-day-phase"
              >
                <option value="">{t('programs.phaseNone')}</option>
                {phases.filter(phase => phase.id).map(phase => (
                  <option key={phase.id} value={phase.id}>{phase.name.trim() || t('programs.phaseName')}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => {
                onDaysChange(days.filter((_, i) => i !== safeIndex));
                setDayIndex(0);
              }}
              className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-neutral-500 hover:text-rose-300"
              aria-label={t('programs.editor.deleteDay')}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="text-[11px] text-neutral-500">{t('programs.tapToEdit')}</p>

          {day.exercises.map((ex, ei) => {
            const open = selected === ei;
            const label = exerciseName(ex.name, ex.catalog_exercise_id) || t('coaching.interventions.liftName');
            const group = supersetGroupOf(ex);
            const linkedNext = isLinkedToNext(day.exercises, ei);
            const linkedPrev = isLinkedToPrevious(day.exercises, ei);
            const partners = supersetPartners(day.exercises, ei);
            const nextExercise = day.exercises[ei + 1];
            const summary = exerciseSummaryParts(ex, tracking).map(part => t(part.key, part.params)).join(' · ');
            const setType = ex.set_type ?? 'working';
            // One menu for the secondary actions; the row itself opens the settings.
            const actions: OverflowAction[] = [
              {
                id: 'replace',
                label: t('programs.editor.replace'),
                onSelect: () => { void fetchExercises(); setSelected(ei); setPickerMode('replace'); setPickerOpen(true); },
              },
              {
                id: 'analyze',
                label: t('programs.editor.analyze'),
                onSelect: () => { void fetchExercises(); setAnalyzed(ei); onAnalyze?.(ex.name); },
              },
              ...(onAsk && ex.name ? [{
                id: 'ask',
                label: t('coaching.programEditor.ask'),
                onSelect: () => onAsk(t('coaching.ask.liftPrompt', { lift: exerciseName(ex.name, ex.catalog_exercise_id) })),
              }] : []),
              {
                id: 'remove',
                label: t('programs.editor.remove'),
                danger: true,
                onSelect: () => {
                  updateDay(safeIndex, { exercises: day.exercises.filter((_, j) => j !== ei) });
                  setSelected(null);
                  setAnalyzed(null);
                },
              },
            ];
            const fieldClass = 'mt-0.5 w-full min-h-11 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-sm text-white';
            const labelClass = 'text-[11px] text-neutral-400';
            return (
              <div
                key={`ex-${safeIndex}-${ei}`}
                draggable
                onDragStart={() => setDragFrom(ei)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => { if (dragFrom != null) reorder(dragFrom, ei); setDragFrom(null); }}
                data-superset={group || undefined}
                className={`rounded-xl border ${
                  open ? 'border-blue-500/50 bg-blue-500/5' : 'border-neutral-800'
                } ${group ? 'border-l-4 border-l-blue-400/60' : ''}`}
              >
                <div className="flex items-center gap-1 pr-1">
                  <button
                    type="button"
                    onClick={() => setSelected(open ? null : ei)}
                    aria-expanded={open}
                    className="flex-1 min-w-0 min-h-11 flex items-center gap-2.5 px-3 py-2.5 text-left"
                  >
                    <GripVertical size={14} aria-hidden="true" className="text-neutral-600 shrink-0 cursor-grab" />
                    <span aria-hidden="true" className="w-6 h-6 rounded-lg bg-neutral-800 text-[11px] text-neutral-400 flex items-center justify-center shrink-0">{ei + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-white truncate">{label}</span>
                      <span className="block text-[11px] text-neutral-400">{summary || '—'}</span>
                    </span>
                    {group ? (
                      <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-200">
                        {t('programs.editor.supersetBadge', { group })}
                      </span>
                    ) : null}
                    <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  <OverflowMenu label={t('programs.editor.actions', { name: label })} actions={actions} />
                </div>

                {open && (
                  <div className="px-3 pb-3 pt-3 space-y-3 border-t border-neutral-800/70">
                    <label className={`block ${labelClass}`}>
                      {t('programs.editor.exerciseName')}
                      <input
                        value={ex.name}
                        onChange={e => updateExercise(ei, { name: e.target.value })}
                        placeholder={t('coaching.interventions.liftName')}
                        className={fieldClass}
                      />
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {showTrainingField(tracking, 'sets') && (
                        <label className={labelClass}>
                          {t('coaching.interventions.sets')}
                          <input
                            type="number"
                            inputMode="numeric"
                            value={ex.default_sets}
                            onChange={e => updateExercise(ei, { default_sets: Math.max(1, Math.min(PROGRAM_EXERCISE_MAX_SETS, +e.target.value || 1)) })}
                            className={fieldClass}
                          />
                        </label>
                      )}
                      {repsInputMode(tracking) !== 'hidden' && (
                        <label className={labelClass}>
                          {repsInputMode(tracking) === 'range'
                            ? t('coaching.programEditor.repRange')
                            : t('coaching.interventions.reps')}
                          <input
                            value={repsInputMode(tracking) === 'single'
                              ? String(ex.default_reps)
                              : (ex.default_reps_min && ex.default_reps_min !== ex.default_reps
                                ? `${ex.default_reps_min}-${ex.default_reps}`
                                : String(ex.default_reps))}
                            onChange={e => {
                              const mode = repsInputMode(tracking);
                              if (mode === 'single') {
                                updateExercise(ei, { default_reps: Math.max(1, +e.target.value || 1), default_reps_min: null });
                                return;
                              }
                              const m = e.target.value.match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
                              if (!m) return;
                              const low = Number(m[1]);
                              const high = m[2] ? Number(m[2]) : low;
                              updateExercise(ei, {
                                default_reps_min: mode === 'range' || m[2] ? low : null,
                                default_reps: high,
                              });
                            }}
                            className={fieldClass}
                          />
                        </label>
                      )}
                      {showTrainingField(tracking, 'load') && (
                        <label className={labelClass}>
                          {t('coaching.tracking.train.load')}
                          <input
                            type="number"
                            inputMode="decimal"
                            value={ex.default_weight_kg ?? ''}
                            placeholder={athlete ? '—' : undefined}
                            onChange={e => updateExercise(ei, {
                              default_weight_kg: e.target.value === '' ? null : Number(e.target.value),
                            })}
                            className={fieldClass}
                          />
                        </label>
                      )}
                      {showTrainingField(tracking, 'rir') && (
                        <label className={labelClass}>
                          RIR
                          <input
                            type="number"
                            inputMode="numeric"
                            value={ex.default_rir ?? ''}
                            placeholder={athlete ? '—' : undefined}
                            onChange={e => updateExercise(ei, { default_rir: e.target.value === '' ? null : Number(e.target.value) })}
                            className={fieldClass}
                          />
                        </label>
                      )}
                      {showTrainingField(tracking, 'rest') && (
                        <label className={labelClass}>
                          {t('coaching.programEditor.rest')}
                          <input
                            type="number"
                            inputMode="numeric"
                            value={ex.default_rest_seconds ?? 90}
                            onChange={e => updateExercise(ei, { default_rest_seconds: Math.max(0, +e.target.value || 0) })}
                            className={fieldClass}
                          />
                        </label>
                      )}
                      <label className={labelClass}>
                        {t('workout.exerciseCard.type')}
                        <select
                          value={setType}
                          onChange={e => {
                            const set_type = e.target.value as ProgramExerciseDraft['set_type'];
                            updateExercise(ei, {
                              set_type,
                              ...(set_type === 'drop'
                                ? { drop_count: ex.drop_count ?? 2, default_sets: Math.min(ex.default_sets || 1, 1) }
                                : {}),
                              // The duration shown is the one saved (it was shown but left empty).
                              ...(set_type === 'isometric'
                                ? { isometric_seconds: ex.isometric_seconds ?? DEFAULT_ISOMETRIC_SECONDS }
                                : {}),
                            });
                          }}
                          className={fieldClass}
                        >
                          {SET_TYPES.filter(st => PROGRAM_SET_TYPES.includes(st.value as typeof PROGRAM_SET_TYPES[number])).map(st => (
                            <option key={st.value} value={st.value}>{optionLabel(t, 'setTypes', st.value, st.label)}</option>
                          ))}
                        </select>
                      </label>
                      {setType === 'drop' && (
                        <label className={labelClass}>
                          {t('coaching.programEditor.dropCount')}
                          <input
                            type="number"
                            min={2}
                            max={6}
                            value={ex.drop_count ?? 2}
                            onChange={e => updateExercise(ei, { drop_count: Math.max(2, +e.target.value || 2) })}
                            className={fieldClass}
                          />
                        </label>
                      )}
                      {setType === 'tempo' && (
                        <label className={labelClass}>
                          Tempo
                          <input
                            value={ex.tempo ?? ''}
                            onChange={e => updateExercise(ei, { tempo: e.target.value || null })}
                            placeholder="3-1-2-0"
                            className={fieldClass}
                          />
                        </label>
                      )}
                      {setType === 'isometric' && (
                        <label className={labelClass}>
                          {t('coaching.programEditor.isoSeconds')}
                          <input
                            type="number"
                            value={ex.isometric_seconds ?? DEFAULT_ISOMETRIC_SECONDS}
                            onChange={e => updateExercise(ei, { isometric_seconds: Math.max(1, +e.target.value || 1) })}
                            className={fieldClass}
                          />
                        </label>
                      )}
                      {setType === 'cluster' && (
                        <>
                          <label className={labelClass}>
                            {t('coaching.programEditor.clusterRest')}
                            <input
                              type="number"
                              value={ex.cluster_rest_seconds ?? 20}
                              onChange={e => updateExercise(ei, { cluster_rest_seconds: Math.max(0, +e.target.value || 0) })}
                              className={fieldClass}
                            />
                          </label>
                          <label className={labelClass}>
                            {t('coaching.programEditor.clusterBurst')}
                            <input
                              type="number"
                              value={ex.cluster_reps_per_burst ?? ''}
                              onChange={e => updateExercise(ei, {
                                cluster_reps_per_burst: e.target.value === '' ? null : Math.max(1, +e.target.value || 1),
                              })}
                              className={fieldClass}
                            />
                          </label>
                        </>
                      )}
                      {setType === 'myo' && (
                        <label className={`${labelClass} flex items-center gap-2 min-h-11 mt-4`}>
                          <input
                            type="checkbox"
                            checked={!!ex.myo_activation}
                            onChange={e => updateExercise(ei, { myo_activation: e.target.checked })}
                          />
                          {t('coaching.programEditor.myoActivation')}
                        </label>
                      )}
                    </div>

                    {/* Supersets: the same superset_group values as before, set by linking neighbours. */}
                    {nextExercise ? (
                      <label className="flex items-start gap-2 min-h-11 cursor-pointer" data-testid="program-superset-link">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={linkedNext}
                          onChange={e => updateDay(safeIndex, {
                            exercises: e.target.checked
                              ? linkWithNext(day.exercises, ei)
                              : unlinkFromNext(day.exercises, ei),
                          })}
                        />
                        <span>
                          <span className="block text-xs text-white">
                            {t('programs.editor.supersetLink', { name: exerciseName(nextExercise.name, nextExercise.catalog_exercise_id) || t('coaching.interventions.liftName') })}
                          </span>
                          <span className="block text-[11px] text-neutral-500">{t('programs.editor.supersetHint')}</span>
                        </span>
                      </label>
                    ) : null}
                    {group && !linkedNext && !linkedPrev ? (
                      <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-neutral-400" data-testid="program-superset-kept">
                        <span>
                          {partners.length > 0
                            ? t('programs.editor.supersetElsewhere', {
                              group,
                              names: partners.map(i => exerciseName(day.exercises[i]?.name, day.exercises[i]?.catalog_exercise_id) || t('coaching.interventions.liftName')).join(', '),
                            })
                            : t('programs.editor.supersetAlone', { group })}
                        </span>
                        <button
                          type="button"
                          className="min-h-11 text-blue-400 hover:text-blue-300"
                          onClick={() => updateDay(safeIndex, { exercises: removeFromSuperset(day.exercises, ei) })}
                        >
                          {t('programs.editor.supersetRemove')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                {analyzed === ei && (
                  <div className="px-3 pb-3">
                    <ExerciseAnalyzeCard
                      name={ex.name}
                      library={exercisesLib}
                      sessionVolumes={volumes}
                      weekVolumes={weekVol}
                    />
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => {
              void fetchExercises();
              setPickerMode('add');
              setPickerOpen(true);
            }}
            className="min-h-11 text-sm text-blue-400 inline-flex items-center gap-1.5"
          >
            <Plus size={14} aria-hidden="true" /> {t('coaching.interventions.addLift')}
          </button>
        </div>
      )}

      {volumes.length > 0 && (
        athlete ? (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-neutral-400">{t('programs.volumeThisSession')}</p>
            <div className="flex flex-wrap gap-1.5">
              {volumes.map(v => (
                <span key={v.muscle} className="text-[11px] px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300">
                  {muscleLabel(v.muscle, i18n.language)} <span className="text-white font-medium">{v.sets}</span>
                </span>
              ))}
            </div>
            {warnings[0] && (
              <p className="text-[11px] text-amber-300">{t('coaching.programEditor.volumeWarn', { muscle: muscleLabel(warnings[0].muscle, i18n.language), n: warnings[0].sets })}</p>
            )}
            {weekVol.length > 0 && (
              <p className="text-[11px] text-neutral-500">
                {t('coaching.programEditor.volumeWeek')}
                {' · '}
                {weekVol.slice(0, 6).map(v => `${muscleLabel(v.muscle, i18n.language)} ${v.sets}`).join(' · ')}
              </p>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-neutral-400">
            <p className="mb-1">{t('coaching.programEditor.volumeSession')}</p>
            <p>{volumes.map(v => `${muscleLabel(v.muscle, i18n.language)} ${v.sets}`).join(' · ')}</p>
            {warnings[0] && (
              <p className="text-amber-300 mt-1">{t('coaching.programEditor.volumeWarn', { muscle: muscleLabel(warnings[0].muscle, i18n.language), n: warnings[0].sets })}</p>
            )}
            {weekVol.length > 0 && (
              <p className="mt-1 text-neutral-500">{t('coaching.programEditor.volumeWeek')}: {weekVol.slice(0, 6).map(v => `${muscleLabel(v.muscle, i18n.language)} ${v.sets}`).join(' · ')}</p>
            )}
          </div>
        )
      )}

      <p className="text-[11px] text-neutral-600 flex items-center gap-1">
        <Sparkles size={11} /> {athlete ? t('programs.noSilentApply') : t('coaching.programEditor.noAuto')}
      </p>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(exName, catalogId) => {
          // A timed catalog exercise (plank) is prescribed as a hold; the coach can change it.
          const timed = catalogId
            ? exercisesLib.find(row => row.id === catalogId)?.measurement === 'time'
            : false;
          const timedDefaults = { set_type: 'isometric' as const, isometric_seconds: DEFAULT_ISOMETRIC_SECONDS };
          if (pickerMode === 'replace' && selected != null && day) {
            const current = day.exercises[selected];
            const keepsType = !timed || (current?.set_type && current.set_type !== 'working');
            updateExercise(selected, {
              name: exName,
              catalog_exercise_id: catalogId ?? null,
              ...(keepsType ? {} : { ...timedDefaults, isometric_seconds: current?.isometric_seconds ?? DEFAULT_ISOMETRIC_SECONDS }),
            });
          } else if (day) {
            const nextIndex = day.exercises.length;
            updateDay(safeIndex, {
              exercises: [...day.exercises, {
                ...emptyEx(),
                name: exName,
                catalog_exercise_id: catalogId ?? null,
                ...(timed ? timedDefaults : {}),
              }],
            });
            setSelected(nextIndex);
            setAnalyzed(null);
          }
        }}
      />
    </div>
  );
}

function ExerciseAnalyzeCard({
  name,
  library,
  sessionVolumes,
  weekVolumes,
}: {
  name: string;
  library: Exercise[];
  sessionVolumes: MuscleVolume[];
  weekVolumes: MuscleVolume[];
}) {
  const { t, i18n } = useTranslation();
  const muscle = muscleForExercise(name, library);
  if (!muscle) {
    return <p className="text-[11px] text-neutral-500">{t('coaching.programEditor.analyzeUnknown')}</p>;
  }
  const session = sessionVolumes.find(v => v.muscle === muscle)?.sets ?? 0;
  const week = weekVolumes.find(v => v.muscle === muscle)?.sets ?? 0;
  return (
    <p className="text-[11px] text-blue-200">
      {t('coaching.programEditor.analyzeMuscle', { muscle: muscleLabel(muscle, i18n.language), session, week })}
    </p>
  );
}
