import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical, Plus, Sparkles } from 'lucide-react';
import type { AiProgramDayDraft, ProgramExerciseDraft } from '../../lib/types';
import { applyProgramProposal, formatPrescription, parseProgramNl, type ProgramNlProposal } from '../../lib/programNl';
import { sessionMuscleVolume, volumeWarnings, weekMuscleVolume } from '../../lib/programVolume';
import { useExerciseStore } from '../../stores/exerciseStore';
import ExercisePicker from '../workout/ExercisePicker';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';

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
}

function emptyDay(weekday: number): AiProgramDayDraft {
  return { weekday, name: '', exercises: [] };
}

function emptyEx(): ProgramExerciseDraft {
  return { name: '', default_sets: 3, default_reps: 10, default_reps_min: 6, default_rir: 2, default_rest_seconds: 90 };
}

export default function ProgramSessionEditor({
  name, description, durationWeeks, days,
  onNameChange, onDescriptionChange, onWeeksChange, onDaysChange,
  onAnalyze, onAsk,
}: Props) {
  const { t } = useTranslation();
  const exercisesLib = useExerciseStore(s => s.exercises);
  const fetchExercises = useExerciseStore(s => s.fetchExercises);
  const [dayIndex, setDayIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nl, setNl] = useState('');
  const [proposal, setProposal] = useState<ProgramNlProposal | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const safeIndex = Math.min(dayIndex, Math.max(0, days.length - 1));
  const day = days[safeIndex];

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

  const nextWeekday = () => {
    const used = new Set(days.map(d => d.weekday));
    return WEEKDAYS.find(d => !used.has(d)) ?? (days.length % 7);
  };

  return (
    <div className="space-y-3">
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

      <form
        onSubmit={e => {
          e.preventDefault();
          const parsed = parseProgramNl(nl, days);
          setProposal(parsed);
          if (!parsed) return;
        }}
        className="flex gap-2"
      >
        <input
          value={nl}
          onChange={e => setNl(e.target.value)}
          placeholder={t('coaching.programNl.placeholder')}
          className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white"
        />
        <Button type="submit" size="sm" variant="secondary">{t('coaching.programNl.propose')}</Button>
      </form>

      {proposal && (
        <Card className="border-blue-500/20 space-y-2">
          <p className="text-xs text-blue-300">{t('coaching.programNl.proposal')}</p>
          <p className="text-sm text-neutral-200">{t(proposal.summaryKey, proposal.summaryParams)}</p>
          <p className="text-[11px] text-neutral-500">
            {proposal.before ? formatPrescription(proposal.before) : '—'}
            {' → '}
            {formatPrescription(proposal.after)}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>{t('common.cancel')}</Button>
            <Button
              size="sm"
              onClick={() => {
                onDaysChange(applyProgramProposal(days, proposal));
                setDayIndex(proposal.dayIndex);
                setSelected(proposal.exerciseIndex);
                setProposal(null);
                setNl('');
              }}
            >
              {t('common.apply')}
            </Button>
          </div>
        </Card>
      )}

      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
        {days.map((d, i) => (
          <button
            key={`day-tab-${i}`}
            type="button"
            onClick={() => { setDayIndex(i); setSelected(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${
              i === safeIndex ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400'
            }`}
          >
            {t(`programs.weekdays.${d.weekday}`)}{d.name ? ` · ${d.name}` : ''}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            onDaysChange([...days, emptyDay(nextWeekday())]);
            setDayIndex(days.length);
          }}
          className="px-3 py-1.5 rounded-lg text-xs text-blue-400 bg-neutral-900"
        >
          + {t('coaching.interventions.addDay')}
        </button>
      </div>

      {day && (
        <div className="rounded-xl border border-neutral-800 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={day.weekday}
              onChange={e => updateDay(safeIndex, { weekday: Number(e.target.value) })}
              className="bg-neutral-900 border border-neutral-800 rounded-xl px-2 py-2 text-xs text-white"
            >
              {WEEKDAYS.map(w => (
                <option key={w} value={w}>{t(`programs.weekdays.${w}`)}</option>
              ))}
            </select>
            <input
              value={day.name}
              onChange={e => updateDay(safeIndex, { name: e.target.value })}
              placeholder={t('coaching.interventions.sessionName')}
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={() => {
                onDaysChange(days.filter((_, i) => i !== safeIndex));
                setDayIndex(0);
              }}
              className="text-[11px] text-neutral-500 hover:text-rose-300"
            >
              {t('common.delete')}
            </button>
          </div>

          {day.exercises.map((ex, ei) => (
            <div
              key={`ex-${safeIndex}-${ei}`}
              draggable
              onDragStart={() => setDragFrom(ei)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragFrom != null) reorder(dragFrom, ei); setDragFrom(null); }}
              onClick={() => setSelected(ei)}
              className={`rounded-xl border px-2 py-2 space-y-2 ${
                selected === ei ? 'border-blue-500/50 bg-blue-500/5' : 'border-neutral-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <GripVertical size={14} className="text-neutral-600 shrink-0 cursor-grab" />
                <input
                  value={ex.name}
                  onChange={e => updateExercise(ei, { name: e.target.value })}
                  placeholder={t('coaching.interventions.liftName')}
                  className="flex-1 bg-transparent text-sm text-white outline-none"
                />
                <button
                  type="button"
                  onClick={() => updateDay(safeIndex, { exercises: day.exercises.filter((_, j) => j !== ei) })}
                  className="text-neutral-600 hover:text-rose-300 text-xs"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                <label className="text-[10px] text-neutral-500">
                  {t('coaching.interventions.sets')}
                  <input
                    type="number"
                    value={ex.default_sets}
                    onChange={e => updateExercise(ei, { default_sets: Math.max(1, +e.target.value || 1) })}
                    className="mt-0.5 w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white"
                  />
                </label>
                <label className="text-[10px] text-neutral-500">
                  {t('coaching.programEditor.repRange')}
                  <input
                    value={ex.default_reps_min && ex.default_reps_min !== ex.default_reps
                      ? `${ex.default_reps_min}-${ex.default_reps}`
                      : String(ex.default_reps)}
                    onChange={e => {
                      const m = e.target.value.match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
                      if (!m) return;
                      const low = Number(m[1]);
                      const high = m[2] ? Number(m[2]) : low;
                      updateExercise(ei, { default_reps_min: m[2] ? low : null, default_reps: high });
                    }}
                    className="mt-0.5 w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white"
                  />
                </label>
                <label className="text-[10px] text-neutral-500">
                  RIR
                  <input
                    type="number"
                    value={ex.default_rir ?? ''}
                    onChange={e => updateExercise(ei, { default_rir: e.target.value === '' ? null : Number(e.target.value) })}
                    className="mt-0.5 w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white"
                  />
                </label>
                <label className="text-[10px] text-neutral-500">
                  {t('coaching.programEditor.rest')}
                  <input
                    type="number"
                    value={ex.default_rest_seconds ?? 90}
                    onChange={e => updateExercise(ei, { default_rest_seconds: Math.max(0, +e.target.value || 0) })}
                    className="mt-0.5 w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white"
                  />
                </label>
              </div>
              {selected === ei && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="text-[11px] text-neutral-300" onClick={() => setPickerOpen(true)}>
                    {t('common.edit')}
                  </button>
                  {onAnalyze && ex.name && (
                    <button type="button" className="text-[11px] text-blue-400" onClick={() => onAnalyze(ex.name)}>
                      {t('coaching.programEditor.analyze')}
                    </button>
                  )}
                  {onAsk && ex.name && (
                    <button
                      type="button"
                      className="text-[11px] text-blue-400"
                      onClick={() => onAsk(t('coaching.ask.liftPrompt', { lift: ex.name }))}
                    >
                      {t('coaching.programEditor.ask')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => {
              void fetchExercises();
              setPickerOpen(true);
            }}
            className="text-[11px] text-blue-400 inline-flex items-center gap-1"
          >
            <Plus size={12} /> {t('coaching.interventions.addLift')}
          </button>
        </div>
      )}

      {volumes.length > 0 && (
        <div className="text-[11px] text-neutral-400">
          <p className="mb-1">{t('coaching.programEditor.volumeSession')}</p>
          <p>{volumes.map(v => `${v.muscle} ${v.sets}`).join(' · ')}</p>
          {warnings.length > 0 && (
            <p className="text-amber-300 mt-1">{t('coaching.programEditor.volumeWarn', { muscle: warnings[0].muscle, n: warnings[0].sets })}</p>
          )}
          {weekVol.length > 0 && (
            <p className="mt-1 text-neutral-500">{t('coaching.programEditor.volumeWeek')}: {weekVol.slice(0, 6).map(v => `${v.muscle} ${v.sets}`).join(' · ')}</p>
          )}
        </div>
      )}

      <p className="text-[11px] text-neutral-600 flex items-center gap-1">
        <Sparkles size={11} /> {t('coaching.programEditor.noAuto')}
      </p>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={exName => {
          if (selected != null && day) updateExercise(selected, { name: exName });
          else if (day) updateDay(safeIndex, { exercises: [...day.exercises, { ...emptyEx(), name: exName }] });
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
