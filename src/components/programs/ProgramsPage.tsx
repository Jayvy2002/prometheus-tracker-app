import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, CalendarRange, Pencil } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProgramStore } from '../../stores/programStore';
import { useRoutineStore } from '../../stores/routineStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { todayStr } from '../../lib/utils';
import { isCoachedAthlete } from '../../lib/coachRole';
import type { ProgramDay } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]; // Mon-first for display, Sunday=0 stored

export default function ProgramsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { programs, loading, fetchPrograms, createProgram, deleteProgram, setProgramDayFromRoutine, assignProgram } = useProgramStore();
  const { routines, fetchRoutines, fetchRoutineWithExercises } = useRoutineStore();
  const { clients, fetchClients, coachingRole, myCoach } = useCoachingStore();
  const isCoach = coachingRole === 'coach';
  const coached = isCoachedAthlete(coachingRole, myCoach);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weeks, setWeeks] = useState(8);
  const [dayNames, setDayNames] = useState<Record<number, string>>({});
  const [dayRoutines, setDayRoutines] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignClient, setAssignClient] = useState('');
  const [assignDate, setAssignDate] = useState(todayStr());

  useEffect(() => {
    if (!user) return;
    fetchPrograms(user.id);
    fetchRoutines(user.id);
    if (isCoach) fetchClients();
  }, [user, isCoach]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekdayLabel = (d: number) => t(`programs.weekdays.${d}`);

  const handleCreate = async () => {
    if (!isCoach || !user || !name.trim()) return;
    setSaving(true);
    const days: Omit<ProgramDay, 'id' | 'program_id' | 'created_at'>[] = WEEKDAYS
      .filter(d => dayNames[d]?.trim() || dayRoutines[d])
      .map((d, i) => ({
        weekday: d,
        name: dayNames[d]?.trim() || '',
        routine_id: dayRoutines[d] || null,
        order_index: i,
      }));
    const id = await createProgram({
      owner_id: user.id,
      name: name.trim(),
      description,
      duration_weeks: weeks,
    }, days);
    if (id) {
      for (const d of days) {
        if (!d.routine_id) continue;
        const program = await useProgramStore.getState().fetchProgram(id);
        const created = program?.days?.find(x => x.weekday === d.weekday);
        const routine = await fetchRoutineWithExercises(d.routine_id);
        if (created && routine) await setProgramDayFromRoutine(created.id, routine);
      }
      toast(t('programs.created'));
      setShowForm(false);
      setName('');
      setDescription('');
      setDayNames({});
      setDayRoutines({});
    } else {
      toast(t('programs.createFailed'), 'error');
    }
    setSaving(false);
  };

  const handleAssign = async () => {
    if (!assigningId || !assignClient) return;
    const { error } = await assignProgram(assigningId, assignClient, assignDate);
    if (error) {
      toast(error, 'error');
      return;
    }
    toast(t('programs.assigned'));
    setAssigningId(null);
  };

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">{t('programs.title')}</h1>
          {isCoach && (
            <Button type="button" size="sm" onClick={() => navigate('/programs/new')} className="mr-11 md:mr-0">
              <Plus size={16} /> {t('common.new')}
            </Button>
          )}
        </div>

        <p className="text-sm text-neutral-500 mb-4">{t('programs.subtitle')}</p>
        {coached && (
          <p className="text-sm text-neutral-400 mb-4">{t('programs.clientLocked')}</p>
        )}

        {loading ? (
          <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-neutral-900 animate-pulse" />)}</div>
        ) : programs.length === 0 ? (
          <Card className="text-center py-10">
            <CalendarRange className="mx-auto mb-3 text-neutral-600" size={28} />
            <p className="text-neutral-400 mb-4">{coached ? t('programs.clientLocked') : t('programs.empty')}</p>
            {isCoach && (
              <Button type="button" size="sm" onClick={() => navigate('/programs/new')}>{t('programs.createFirst')}</Button>
            )}
          </Card>
        ) : (
          <div className="space-y-3">
            {programs.map(p => {
              const exerciseCount = (p.days ?? []).reduce((n, d) => n + (d.exercises?.length ?? 0), 0);
              return (
              <Card key={p.id} onClick={isCoach ? () => navigate(`/programs/${p.id}`) : undefined}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white">{p.name}</p>
                    <p className="text-xs text-neutral-500">{t('programs.weeksCount', { n: p.duration_weeks })}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(p.days ?? []).filter(d => d.name).map(d => (
                        <span key={d.id} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                          {weekdayLabel(d.weekday)}: {d.name}
                        </span>
                      ))}
                      {exerciseCount === 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                          {t('programs.noExercises')}
                        </span>
                      )}
                    </div>
                  </div>
                  {isCoach && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); navigate(`/programs/${p.id}`); }}
                        className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800"
                        aria-label={t('common.edit')}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); void deleteProgram(p.id); }}
                        className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-neutral-800"
                        aria-label={t('common.delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
                {isCoach && clients.length > 0 && (
                  <Button type="button" size="sm" variant="secondary" className="w-full mt-3" onClick={e => { e.stopPropagation(); setAssigningId(p.id); setAssignClient(clients[0].id); }}>
                    {t('programs.assign')}
                  </Button>
                )}
              </Card>
              );
            })}
          </div>
        )}

        {isCoach && (
        <button type="button" onClick={() => navigate('/routines')} className="mt-6 text-sm text-blue-400">
          {t('programs.manageRoutines')}
        </button>
        )}
      </div>

      <Modal open={isCoach && showForm} onClose={() => setShowForm(false)} title={t('programs.newTitle')}>
        <div className="space-y-4">
          <Input label={t('programs.name')} value={name} onChange={e => setName(e.target.value)} placeholder="Hypertrophy block" />
          <Input label={t('programs.description')} value={description} onChange={e => setDescription(e.target.value)} />
          <Input label={t('programs.durationWeeks')} type="number" value={weeks} onChange={e => setWeeks(Math.max(1, Math.min(52, +e.target.value || 1)))} />
          <div>
            <p className="text-sm font-medium text-neutral-300 mb-2">{t('programs.days')}</p>
            <div className="space-y-2">
              {WEEKDAYS.map(d => (
                <div key={d} className="grid grid-cols-[72px_1fr_1fr] gap-2 items-center">
                  <span className="text-xs text-neutral-400">{weekdayLabel(d)}</span>
                  <input
                    value={dayNames[d] ?? ''}
                    onChange={e => setDayNames(s => ({ ...s, [d]: e.target.value }))}
                    placeholder={t('programs.dayName')}
                    className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-white"
                  />
                  <select
                    value={dayRoutines[d] ?? ''}
                    onChange={e => setDayRoutines(s => ({ ...s, [d]: e.target.value }))}
                    className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-white"
                  >
                    <option value="">{t('programs.noRoutine')}</option>
                    {routines.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <Button onClick={handleCreate} loading={saving} disabled={!name.trim()} className="w-full">
            {t('programs.create')}
          </Button>
        </div>
      </Modal>

      <Modal open={!!assigningId} onClose={() => setAssigningId(null)} title={t('programs.assign')}>
        <div className="space-y-3">
          <select
            value={assignClient}
            onChange={e => setAssignClient(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
          >
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.full_name || c.email}</option>
            ))}
          </select>
          <input
            type="date"
            value={assignDate}
            onChange={e => setAssignDate(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
          />
          <Button onClick={handleAssign} className="w-full">{t('programs.assign')}</Button>
        </div>
      </Modal>
    </PageTransition>
  );
}
