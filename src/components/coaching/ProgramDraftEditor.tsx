import type { AiProgramDayDraft } from '../../lib/types';
import { useTranslation } from 'react-i18next';
import Input from '../ui/Input';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

interface ProgramDraftEditorProps {
  name: string;
  description: string;
  durationWeeks: number;
  days: AiProgramDayDraft[];
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onWeeksChange: (value: number) => void;
  onDaysChange: (days: AiProgramDayDraft[]) => void;
}

function emptyDay(weekday: number): AiProgramDayDraft {
  return { weekday, name: '', exercises: [{ name: '', default_sets: 3, default_reps: 10 }] };
}

export default function ProgramDraftEditor({
  name,
  description,
  durationWeeks,
  days,
  onNameChange,
  onDescriptionChange,
  onWeeksChange,
  onDaysChange,
}: ProgramDraftEditorProps) {
  const { t } = useTranslation();

  const updateDay = (index: number, patch: Partial<AiProgramDayDraft>) => {
    onDaysChange(days.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const updateExercise = (
    dayIndex: number,
    exIndex: number,
    patch: Partial<AiProgramDayDraft['exercises'][number]>,
  ) => {
    onDaysChange(days.map((d, i) => {
      if (i !== dayIndex) return d;
      return {
        ...d,
        exercises: d.exercises.map((ex, j) => (j === exIndex ? { ...ex, ...patch } : ex)),
      };
    }));
  };

  const nextWeekday = () => {
    const used = new Set(days.map(d => d.weekday));
    return WEEKDAYS.find(d => !used.has(d)) ?? (days.length % 7);
  };

  return (
    <div className="space-y-3">
      <Input label={t('programs.name')} value={name} onChange={e => onNameChange(e.target.value)} />
      <Input
        label={t('programs.description')}
        value={description}
        onChange={e => onDescriptionChange(e.target.value)}
      />
      <Input
        label={t('programs.durationWeeks')}
        type="number"
        value={durationWeeks}
        onChange={e => onWeeksChange(Math.max(1, Math.min(52, +e.target.value || 8)))}
      />
      {days.map((day, di) => (
        <div key={`day-${di}`} className="rounded-xl border border-neutral-800 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={day.weekday}
              onChange={e => updateDay(di, { weekday: Number(e.target.value) })}
              className="bg-neutral-900 border border-neutral-800 rounded-xl px-2 py-2 text-xs text-white"
            >
              {WEEKDAYS.map(w => (
                <option key={w} value={w}>{t(`programs.weekdays.${w}`)}</option>
              ))}
            </select>
            <input
              value={day.name}
              onChange={e => updateDay(di, { name: e.target.value })}
              placeholder={t('coaching.interventions.sessionName')}
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={() => onDaysChange(days.filter((_, i) => i !== di))}
              className="text-[11px] text-neutral-500 hover:text-rose-300"
            >
              {t('common.delete')}
            </button>
          </div>
          {day.exercises.map((ex, ei) => (
            <div key={`ex-${di}-${ei}`} className="grid grid-cols-[1fr_56px_56px_28px] gap-1">
              <input
                value={ex.name}
                onChange={e => updateExercise(di, ei, { name: e.target.value })}
                placeholder={t('coaching.interventions.liftName')}
                className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-white"
              />
              <input
                type="number"
                value={ex.default_sets}
                onChange={e => updateExercise(di, ei, { default_sets: Math.max(1, +e.target.value || 1) })}
                className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-white"
                aria-label={t('coaching.interventions.sets')}
              />
              <input
                type="number"
                value={ex.default_reps}
                onChange={e => updateExercise(di, ei, { default_reps: Math.max(1, +e.target.value || 1) })}
                className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-white"
                aria-label={t('coaching.interventions.reps')}
              />
              <button
                type="button"
                onClick={() => updateDay(di, { exercises: day.exercises.filter((_, j) => j !== ei) })}
                className="text-neutral-600 hover:text-rose-300 text-xs"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => updateDay(di, {
              exercises: [...day.exercises, { name: '', default_sets: 3, default_reps: 10 }],
            })}
            className="text-[11px] text-blue-400"
          >
            {t('coaching.interventions.addLift')}
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onDaysChange([...days, emptyDay(nextWeekday())])}
        className="text-xs text-blue-400"
      >
        {t('coaching.interventions.addDay')}
      </button>
    </div>
  );
}
