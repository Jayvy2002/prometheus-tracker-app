import { useState } from 'react';
import { Check, ChevronRight, Dumbbell, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { programSessionLabel } from '../../features/programs/domain/namedSession';
import type { ClientGymCard as GymCard } from '../../lib/clientGym';
import type { ProgramDay, ProgramDayExercise } from '../../lib/types';
import Button from '../ui/Button';
import ListRow from '../ui/ListRow';
import { useRegisterInlineResume } from '../../features/workout/hooks/useResumableWorkout';
import { useExerciseDisplayName } from '../../features/workout/hooks/useExerciseDisplayName';

interface Props {
  card: GymCard;
  programName: string;
  programWeek: number | null;
  durationWeeks: number;
  starting: boolean;
  onStart: (day: ProgramDay) => void;
  onContinue: (workoutId: string) => void;
  onEditPlan?: () => void;
  phaseName?: string | null;
  plannedChange?: string | null;
  /** Opens the program; replaces the separate « Mon programme » card. */
  onOpenProgram?: () => void;
}

function repsLabel(ex: ProgramDayExercise): string {
  if (ex.default_reps_min && ex.default_reps_min !== ex.default_reps) {
    return `${ex.default_reps_min}–${ex.default_reps}`;
  }
  return String(ex.default_reps);
}

export default function ClientGymCard({
  card,
  programName,
  programWeek,
  durationWeeks,
  starting,
  onStart,
  onContinue,
  onEditPlan,
  phaseName,
  plannedChange,
  onOpenProgram,
}: Props) {
  const { t } = useTranslation();
  useRegisterInlineResume(card.kind === 'continue' && card.day ? card.workoutId : null);
  if (card.kind === 'none') return null;

  const weekLabel = [
    programWeek != null ? t('programs.weekOf', { current: programWeek, total: durationWeeks }) : null,
    phaseName?.trim() ? t('programs.currentPhase', { name: phaseName.trim() }) : null,
    plannedChange?.trim() ? plannedChange.trim() : null,
  ].filter(Boolean).join(' · ');

  if (card.kind === 'done_next') {
    return (
      <div className="mb-4 space-y-2">
        <ListRow
          tone="success"
          icon={<Check size={18} />}
          title={t('dashboard.gym.done')}
          subtitle={card.doneDay
            ? programSessionLabel(card.doneDay, n => t(`programs.weekdays.${n}`), programName)
            : undefined}
        />
        {card.nextDay && (
          <SessionPreview
            day={card.nextDay}
            eyebrow={t('dashboard.gym.next', { name: card.nextDay.name || programName })}
            kindLabel={t('dashboard.gym.kindNext')}
            weekLabel={weekLabel}
            cta={t('dashboard.gym.startCta')}
            starting={starting}
            showPreviewHint
            onStart={() => onStart(card.nextDay!)}
            onEditPlan={onEditPlan}
            programName={programName}
            onOpenProgram={onOpenProgram}
          />
        )}
      </div>
    );
  }

  const day = card.day;
  const continueMode = card.kind === 'continue';
  if (!day) return null;
  const title = continueMode
    ? t('dashboard.gym.continue', { name: day.name || programName })
    : card.isToday && typeof day.weekday === 'number'
      ? t('programs.todaySession', { name: day.name || programName })
      : t('dashboard.gym.next', { name: day.name || programName });

  return (
    <SessionPreview
      day={day}
      eyebrow={title}
      kindLabel={continueMode
        ? t('dashboard.gym.kindContinue')
        : card.isToday ? t('dashboard.gym.kindToday') : t('dashboard.gym.kindNext')}
      weekLabel={weekLabel}
      cta={continueMode ? t('dashboard.gym.continueCta') : t('dashboard.gym.startCta')}
      starting={starting}
      showPreviewHint={!continueMode}
      onStart={() => {
        if (continueMode && card.workoutId) onContinue(card.workoutId);
        else onStart(day);
      }}
      onEditPlan={continueMode ? undefined : onEditPlan}
      programName={programName}
      onOpenProgram={onOpenProgram}
    />
  );
}

function SessionPreview({
  day,
  eyebrow,
  kindLabel,
  weekLabel,
  cta,
  starting,
  showPreviewHint,
  onStart,
  onEditPlan,
  programName,
  onOpenProgram,
}: {
  day: ProgramDay;
  eyebrow: string;
  /** Short kind (« Aujourd’hui », « Prochaine séance », « En cours »); the name is on the next line. */
  kindLabel: string;
  weekLabel: string;
  cta: string;
  starting: boolean;
  showPreviewHint?: boolean;
  onStart: () => void;
  onEditPlan?: () => void;
  programName: string;
  onOpenProgram?: () => void;
}) {
  const { t } = useTranslation();
  const exerciseName = useExerciseDisplayName();
  void showPreviewHint;
  const [openList, setOpenList] = useState(false);
  const exercises = [...(day.exercises ?? [])].sort((a, b) => a.order_index - b.order_index);
  const count = exercises.length;
  const minutes = Math.max(20, count * 8);

  // One compact row: what, how long, start. The program and the exercise list
  // are one tap away instead of taking the screen.
  return (
    <section
      aria-label={eyebrow}
      className="w-full rounded-2xl border border-blue-500/30 bg-blue-600/10 p-3 mb-4"
      data-testid="dashboard-session"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
          <Play size={16} className="text-blue-400 ml-0.5" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-blue-300 font-medium truncate">{kindLabel}</p>
          <p className="text-sm font-semibold text-white truncate" data-testid="ux22-session-label">
            {programSessionLabel(day, n => t(`programs.weekdays.${n}`))}
          </p>
          {count > 0 && (
            <p className="text-xs text-neutral-400 truncate">
              {t('dashboard.gym.exercises', { n: count })} · {minutes} min
            </p>
          )}
        </div>
        <Button type="button" size="sm" className="shrink-0" loading={starting} onClick={onStart}>
          {cta}
          <ChevronRight size={14} />
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-neutral-400">
        {onOpenProgram ? (
          <button type="button" className="min-h-11 truncate max-w-full text-left hover:text-white" onClick={onOpenProgram}>
            {[programName, weekLabel].filter(Boolean).join(' · ')}
          </button>
        ) : (
          <span className="min-h-11 inline-flex items-center truncate">{[programName, weekLabel].filter(Boolean).join(' · ')}</span>
        )}
        {count === 0 ? (
          <span className="text-neutral-500">{t('programs.noExercises')}</span>
        ) : (
          <button
            type="button"
            className="min-h-11 text-neutral-300 hover:text-white"
            aria-expanded={openList}
            onClick={() => setOpenList(v => !v)}
          >
            {openList ? t('dashboard.gym.hideList') : t('dashboard.gym.showList')}
          </button>
        )}
        {onEditPlan && !onOpenProgram && (
          <button type="button" className="min-h-11 text-neutral-300 hover:text-white" onClick={onEditPlan}>
            {t('dashboard.gym.editPlan')}
          </button>
        )}
      </div>
      {openList && (
        <ul className="mt-1 space-y-1">
          {exercises.map(ex => (
            <li key={ex.id} className="flex items-start gap-1.5 text-sm text-neutral-300">
              <Dumbbell size={14} className="text-blue-400/70 mt-0.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="text-white">{exerciseName(ex.name, ex.catalog_exercise_id)}</span>
                <span className="text-neutral-500"> · {ex.default_sets}×{repsLabel(ex)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
