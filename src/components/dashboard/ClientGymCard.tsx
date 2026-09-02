import { Check, Dumbbell, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ClientGymCard as GymCard } from '../../lib/clientGym';
import type { ProgramDay } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';

interface Props {
  card: GymCard;
  programName: string;
  programWeek: number | null;
  durationWeeks: number;
  starting: boolean;
  onStart: (day: ProgramDay) => void;
  onContinue: (workoutId: string) => void;
}

export default function ClientGymCard({
  card,
  programName,
  programWeek,
  durationWeeks,
  starting,
  onStart,
  onContinue,
}: Props) {
  const { t } = useTranslation();
  if (card.kind === 'none') return null;

  const weekLabel = programWeek != null
    ? t('programs.weekOf', { current: programWeek, total: durationWeeks })
    : programName;

  if (card.kind === 'done_next') {
    return (
      <div className="mb-4 space-y-2">
        <Card className="flex items-center gap-3 !border-emerald-500/25" glow="green">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Check size={18} className="text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{t('dashboard.gym.done')}</p>
            {card.doneDay && (
              <p className="text-[11px] text-emerald-200/80 truncate">
                {card.doneDay.name || programName}
              </p>
            )}
          </div>
        </Card>
        {card.nextDay && (
          <StartRow
            day={card.nextDay}
            eyebrow={t('dashboard.gym.next', { name: card.nextDay.name || programName })}
            weekLabel={weekLabel}
            cta={t('dashboard.gym.startCta')}
            starting={starting}
            onStart={() => onStart(card.nextDay!)}
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
    : card.isToday
      ? t('programs.todaySession', { name: day.name || programName })
      : t('dashboard.gym.next', { name: day.name || programName });

  return (
    <StartRow
      day={day}
      eyebrow={title}
      weekLabel={weekLabel}
      cta={continueMode ? t('dashboard.gym.continueCta') : t('dashboard.gym.startCta')}
      starting={starting}
      onStart={() => {
        if (continueMode && card.workoutId) onContinue(card.workoutId);
        else onStart(day);
      }}
    />
  );
}

function StartRow({
  day,
  eyebrow,
  weekLabel,
  cta,
  starting,
  onStart,
}: {
  day: ProgramDay;
  eyebrow: string;
  weekLabel: string;
  cta: string;
  starting: boolean;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const count = day.exercises?.length ?? 0;
  return (
    <Card className="mb-4" glow="blue">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
          <Play size={18} className="text-blue-400 ml-0.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-blue-300 font-medium">{eyebrow}</p>
          <p className="text-sm font-semibold text-white truncate">
            {t(`programs.weekdays.${day.weekday}`)}
            {count > 0 ? ` · ${t('dashboard.gym.exercises', { n: count })}` : ''}
          </p>
          <p className="text-[11px] text-neutral-500 mt-0.5 truncate">{weekLabel}</p>
        </div>
        <Button size="sm" disabled={starting} onClick={onStart} className="shrink-0">
          {cta}
        </Button>
      </div>
      {count > 0 && (
        <p className="mt-2 text-[11px] text-neutral-400 flex items-center gap-1.5">
          <Dumbbell size={11} className="text-blue-400/70" />
          {(day.exercises ?? []).slice(0, 3).map(ex => ex.name).join(' · ')}
          {count > 3 ? '…' : ''}
        </p>
      )}
    </Card>
  );
}
