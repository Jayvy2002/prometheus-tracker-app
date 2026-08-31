import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange, Dumbbell } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProgramStore } from '../../stores/programStore';
import { isProgramTrainingDay, trainingDays } from '../../lib/clientGym';
import { programWeekNumber } from '../../lib/utils';
import type { ProgramDay, ProgramDayExercise } from '../../lib/types';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function repsLabel(ex: ProgramDayExercise): string {
  if (ex.default_reps_min && ex.default_reps_min !== ex.default_reps) {
    return `${ex.default_reps_min}–${ex.default_reps}`;
  }
  return String(ex.default_reps);
}

export default function ClientProgramPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { assignment, fetchMyAssignment, loading } = useProgramStore();

  useEffect(() => {
    if (!user) return;
    void fetchMyAssignment(user.id);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const program = assignment?.status === 'active' ? assignment.program : undefined;
  const days = trainingDays(program?.days);
  const todayWeekday = new Date().getDay();
  const week = program
    ? programWeekNumber(assignment!.start_date, program.duration_weeks)
    : null;
  const todayDay = days.find(d => d.weekday === todayWeekday) ?? null;

  const weekdayLabel = (d: number) => t(`programs.weekdays.${d}`);

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-8">
        <h1 className="text-2xl font-bold text-white mb-1">{t('programs.mineTitle')}</h1>
        <p className="text-sm text-neutral-500 mb-5">{t('programs.mineSubtitle')}</p>

        {loading && !program ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-neutral-900 animate-pulse" />)}</div>
        ) : !program ? (
          <Card className="text-center py-10">
            <CalendarRange className="mx-auto mb-3 text-neutral-600" size={28} />
            <p className="text-neutral-400">{t('programs.noAssignment')}</p>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <p className="text-lg font-semibold text-white">{program.name}</p>
              {program.description?.trim() ? (
                <p className="text-sm text-neutral-400 mt-1">{program.description}</p>
              ) : null}
              {week != null && (
                <>
                  <p className="text-xs text-blue-300 mt-2">
                    {t('programs.weekOf', { current: week, total: program.duration_weeks })}
                  </p>
                  <div className="flex gap-1 mt-2">
                    {Array.from({ length: program.duration_weeks }, (_, i) => i + 1).map(n => (
                      <span
                        key={n}
                        className={`h-1.5 flex-1 rounded-full ${n === week ? 'bg-blue-500' : n < week ? 'bg-blue-500/40' : 'bg-neutral-800'}`}
                        title={`${t('programs.weekOf', { current: n, total: program.duration_weeks })}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </Card>

            {todayDay && (
              <Card className="border-blue-500/30" glow="blue">
                <p className="text-[11px] font-medium text-blue-300 mb-1">{t('programs.todayBadge')}</p>
                <p className="text-sm font-semibold text-white">
                  {weekdayLabel(todayDay.weekday)}
                  {todayDay.name ? ` · ${todayDay.name}` : ''}
                </p>
                <ExerciseList exercises={todayDay.exercises ?? []} emptyLabel={t('programs.noExercises')} />
              </Card>
            )}

            <div className="space-y-2">
              {WEEKDAY_ORDER.map(wd => {
                const day = (program.days ?? []).find(d => d.weekday === wd);
                if (!day || !isProgramTrainingDay(day)) return null;
                return (
                  <DayCard
                    key={day.id}
                    day={day}
                    label={weekdayLabel(day.weekday)}
                    isToday={day.weekday === todayWeekday}
                    todayLabel={t('programs.todayBadge')}
                    emptyLabel={t('programs.noExercises')}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

function DayCard({
  day,
  label,
  isToday,
  todayLabel,
  emptyLabel,
}: {
  day: ProgramDay;
  label: string;
  isToday: boolean;
  todayLabel: string;
  emptyLabel: string;
}) {
  return (
    <Card className={isToday ? 'border-blue-500/20' : undefined}>
      <div className="flex items-center gap-2 mb-1">
        <p className="text-sm font-semibold text-white">
          {label}{day.name ? ` · ${day.name}` : ''}
        </p>
        {isToday && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-600/20 text-blue-300">{todayLabel}</span>
        )}
      </div>
      <ExerciseList exercises={day.exercises ?? []} emptyLabel={emptyLabel} />
    </Card>
  );
}

function ExerciseList({ exercises, emptyLabel }: { exercises: ProgramDayExercise[]; emptyLabel: string }) {
  if (exercises.length === 0) {
    return <p className="text-xs text-neutral-500 mt-1">{emptyLabel}</p>;
  }
  return (
    <ul className="mt-2 space-y-1">
      {exercises.slice().sort((a, b) => a.order_index - b.order_index).map(ex => (
        <li key={ex.id} className="flex items-start gap-2 text-xs text-neutral-300">
          <Dumbbell size={11} className="text-blue-400/70 mt-0.5 shrink-0" />
          <span className="min-w-0">
            <span className="text-white">{ex.name}</span>
            <span className="text-neutral-500"> · {ex.default_sets}×{repsLabel(ex)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
