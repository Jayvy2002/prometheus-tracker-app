import { Check, ChevronRight, Dumbbell, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { programSessionLabel } from '../../features/programs/domain/namedSession';
import type { ClientGymCard as GymCard } from '../../lib/clientGym';
import type { ProgramDay, ProgramDayExercise } from '../../lib/types';
import Button from '../ui/Button';
import ListRow from '../ui/ListRow';

interface Props {
  card: GymCard;
  programName: string;
  programWeek: number | null;
  durationWeeks: number;
  starting: boolean;
  onStart: (day: ProgramDay) => void;
  onContinue: (workoutId: string) => void;
  onEditPlan?: () => void;
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
}: Props) {
  const { t } = useTranslation();
  if (card.kind === 'none') return null;

  const weekLabel = programWeek != null
    ? t('programs.weekOf', { current: programWeek, total: durationWeeks })
    : programName;

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
            weekLabel={weekLabel}
            cta={t('dashboard.gym.startCta')}
            starting={starting}
            showPreviewHint
            onStart={() => onStart(card.nextDay!)}
            onEditPlan={onEditPlan}
          />
        )}
      </div>
    );
  }

  const day = card.day;
  if (!day) return null;
  const continueMode = card.kind === 'continue';
  const title = continueMode
    ? t('dashboard.gym.continue', { name: day.name || programName })
    : card.isToday && typeof day.weekday === 'number'
      ? t('programs.todaySession', { name: day.name || programName })
      : t('dashboard.gym.next', { name: day.name || programName });

  return (
    <SessionPreview
      day={day}
      eyebrow={title}
      weekLabel={weekLabel}
      cta={continueMode ? t('dashboard.gym.continueCta') : t('dashboard.gym.startCta')}
      starting={starting}
      showPreviewHint={!continueMode}
      onStart={() => {
        if (continueMode && card.workoutId) onContinue(card.workoutId);
        else onStart(day);
      }}
      onEditPlan={continueMode ? undefined : onEditPlan}
    />
  );
}

function SessionPreview({
  day,
  eyebrow,
  weekLabel,
  cta,
  starting,
  showPreviewHint,
  onStart,
  onEditPlan,
}: {
  day: ProgramDay;
  eyebrow: string;
  weekLabel: string;
  cta: string;
  starting: boolean;
  showPreviewHint: boolean;
  onStart: () => void;
  onEditPlan?: () => void;
}) {
  const { t } = useTranslation();
  const exercises = [...(day.exercises ?? [])].sort((a, b) => a.order_index - b.order_index);
  const count = exercises.length;

  return (
    <div className="w-full bg-gradient-to-r from-blue-600/20 to-blue-500/5 border border-blue-500/30 rounded-2xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
          <Play size={18} className="text-blue-400 ml-0.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-blue-300 font-medium">{eyebrow}</p>
          <p className="text-sm font-semibold text-white truncate" data-testid="ux22-session-label">
            {programSessionLabel(day, n => t(`programs.weekdays.${n}`))}
            {count > 0 ? ` · ${t('dashboard.gym.exercises', { n: count })}` : ''}
          </p>
          <p className="text-xs text-neutral-500 mt-0.5 truncate">{weekLabel}</p>
        </div>
      </div>

      {count === 0 ? (
        <p className="mt-3 text-xs text-neutral-500">{t('programs.noExercises')}</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {exercises.map(ex => (
            <li key={ex.id} className="flex items-start gap-1.5 text-[12px] text-neutral-300">
              <Dumbbell size={11} className="text-blue-400/70 mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="text-white">{ex.name}</span>
                <span className="text-neutral-500"> · {ex.default_sets}×{repsLabel(ex)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {showPreviewHint && (
        <p className="mt-2 text-xs text-neutral-500">{t('dashboard.gym.previewHint')}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" loading={starting} onClick={onStart}>
          {cta}
          <ChevronRight size={14} />
        </Button>
        {onEditPlan && (
          <Button type="button" variant="ghost" size="sm" onClick={onEditPlan}>
            {t('dashboard.gym.editPlan')}
          </Button>
        )}
      </div>
    </div>
  );
}
