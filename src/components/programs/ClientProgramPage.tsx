import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange, Dumbbell } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { useProgramStore } from '../../stores/programStore';
import { namedSessionLine } from '../../features/programs/domain/namedSession';
import { isProgramTrainingDay, trainingDays } from '../../lib/clientGym';
import { isSoloAthlete } from '../../lib/coachRole';
import { emptyProgramDraftDay, pendingSoloProgramDraft, programDaysToDraft } from '../../lib/soloProgram';
import { programWeekNumber } from '../../lib/utils';
import { outlineFromEdited } from '../../lib/coachDraftSend';
import type { AiProgramDayDraft, ProgramDay, ProgramDayExercise } from '../../lib/types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import PageTransition from '../ui/PageTransition';
import ProgramSessionEditor from '../coaching/ProgramSessionEditor';
import SoloProgramProposal from '../dashboard/SoloProgramProposal';
import { toast } from '../ui/Toast';
import { mapProgramWriteError } from '../../lib/programWrite';

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
  const { assignment, fetchMyAssignment, fetchPausedAssignments, loading, saveProgram } = useProgramStore();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const pendingInterventions = useCoachingStore(s => s.pendingInterventions);
  const fetchPendingInterventions = useCoachingStore(s => s.fetchPendingInterventions);
  const applyProgramOutline = useCoachingStore(s => s.applyProgramOutline);
  const solo = isSoloAthlete(coachingRole, myCoach);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archives, setArchives] = useState<Awaited<ReturnType<typeof fetchPausedAssignments>>>([]);
  const [archivesOpen, setArchivesOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weeks, setWeeks] = useState(8);
  const [days, setDays] = useState<AiProgramDayDraft[]>([emptyProgramDraftDay()]);

  useEffect(() => {
    if (!user) return;
    void fetchMyAssignment(user.id);
    void fetchPausedAssignments(user.id).then(setArchives);
    if (solo) void fetchPendingInterventions();
  }, [user, solo]); // eslint-disable-line react-hooks/exhaustive-deps

  const program = assignment?.status === 'active' ? assignment.program : undefined;
  const pending = solo ? pendingSoloProgramDraft(pendingInterventions, user?.id) : null;
  const training = trainingDays(program?.days);
  const todayWeekday = new Date().getDay();
  const week = program
    ? programWeekNumber(assignment!.start_date, program.duration_weeks)
    : null;
  const todayDay = training.find(d => d.weekday === todayWeekday) ?? null;
  const showEditor = solo && (!!program || creating);

  useEffect(() => {
    if (!program) return;
    setCreating(false);
    setName(program.name);
    setDescription(program.description ?? '');
    setWeeks(program.duration_weeks);
    setDays(programDaysToDraft(program.days));
  }, [program?.id, program?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekdayLabel = (d: number) => t(`programs.weekdays.${d}`);

  const startBlank = () => {
    setCreating(true);
    setName(t('programs.mineTitle'));
    setDescription('');
    setWeeks(8);
    setDays([emptyProgramDraftDay()]);
  };

  const handleSave = async () => {
    if (!user || saving) return;
    const outline = outlineFromEdited({
      programName: name,
      programDesc: description,
      programWeeks: weeks,
      days,
      patch: null,
    });
    if (!outline) {
      toast(t('programs.needDayAndLift'), 'info');
      return;
    }
    setSaving(true);
    if (!program) {
      const created = await applyProgramOutline(user.id, outline);
      setSaving(false);
      if (created.error) {
        toast(created.error, 'error');
        return;
      }
      toast(t('programs.selfAssigned'));
      return;
    }
    const saved = await saveProgram(
      program.id,
      {
        name: outline.name,
        description: outline.description,
        duration_weeks: outline.duration_weeks,
      },
      outline.days,
      program.updated_at,
    );
    setSaving(false);
    if (saved.error) {
      toast(mapProgramWriteError(saved.error, {
        stale: t('programs.stale'),
        fallback: t('programs.saveFailed'),
      }), 'error');
      return;
    }
    await fetchMyAssignment(user.id);
    toast(t('common.saveChanges'));
  };

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-8">
        <h1 className="text-2xl font-bold text-white mb-1">{t('programs.mineTitle')}</h1>
        <p className="text-sm text-neutral-500 mb-5">
          {solo ? t('programs.soloReadFirst') : t('programs.mineSubtitle')}
        </p>

        {solo && <SoloProgramProposal />}

        {loading && !program && !creating ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-neutral-900 animate-pulse" />)}</div>
        ) : showEditor ? (
          <div className="space-y-4">
            <ProgramSessionEditor
              name={name}
              description={description}
              durationWeeks={weeks}
              days={days}
              clientId={user?.id}
              programId={program?.id ?? null}
              presentation="athlete"
              currentWeek={week}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              onWeeksChange={setWeeks}
              onDaysChange={setDays}
            />
            <div className="sticky bottom-20 md:bottom-4 z-10 pt-1">
              <Button className="w-full shadow-lg shadow-black/50" onClick={() => void handleSave()} loading={saving} disabled={!name.trim()}>
                {program ? t('programs.savePlan') : t('programs.createMine')}
              </Button>
            </div>
          </div>
        ) : !program ? (
          pending ? null : (
            <Card className="text-center py-10">
              <CalendarRange className="mx-auto mb-3 text-neutral-600" size={28} />
              <p className="text-neutral-400 mb-4">{solo ? t('programs.soloEmpty') : t('programs.noAssignment')}</p>
              {solo && (
                <Button type="button" size="sm" onClick={startBlank}>{t('programs.createMine')}</Button>
              )}
            </Card>
          )
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
                <p className="text-sm font-semibold text-white" data-testid="ux22-program-today">
                  {namedSessionLine(weekdayLabel(todayDay.weekday), todayDay.name)}
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

        {archives.filter(a => a.id !== assignment?.id).length > 0 && (
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setArchivesOpen(o => !o)}
              className="text-sm font-medium text-neutral-300 hover:text-white"
            >
              {t('programs.archivesTitle')} ({archives.filter(a => a.id !== assignment?.id).length})
            </button>
            <p className="text-[11px] text-neutral-600 mt-0.5 mb-2">{t('programs.archivesReadOnly')}</p>
            {archivesOpen && (
              <div className="space-y-2">
                {archives.filter(a => a.id !== assignment?.id).map(a => (
                  <Card key={a.id}>
                    <p className="text-sm font-medium text-white">{a.program?.name || t('programs.assigned')}</p>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      {(a.program?.days ?? []).filter(isProgramTrainingDay).length} j · {a.program?.duration_weeks} sem.
                    </p>
                    {(a.program?.days ?? []).filter(isProgramTrainingDay).map(d => (
                      <div key={d.id} className="mt-2">
                        <p className="text-xs text-neutral-400">{namedSessionLine(weekdayLabel(d.weekday), d.name)}</p>
                        <ExerciseList exercises={d.exercises ?? []} emptyLabel={t('programs.noExercises')} />
                      </div>
                    ))}
                  </Card>
                ))}
              </div>
            )}
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
          {namedSessionLine(label, day.name)}
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
