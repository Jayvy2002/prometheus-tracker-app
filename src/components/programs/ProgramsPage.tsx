import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
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
import OverflowMenu from '../ui/OverflowMenu';
import EmptyState from '../ui/EmptyState';
import { ListSkeleton } from '../ui/PageSkeleton';
import ErrorState from '../ui/ErrorState';
import { toast } from '../ui/Toast';
import { assignStartLabel } from '../../lib/programWrite';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]; // Mon-first for display, Sunday=0 stored

export default function ProgramsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { programs, programsError, loading, fetchPrograms, createProgram, deleteProgram, assignProgram, duplicateProgram } = useProgramStore();
  const { routines, fetchRoutines } = useRoutineStore();
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
            <Button type="button" size="sm" onClick={() => navigate('/programs/new')}>
              <Plus size={16} /> {t('common.new')}
            </Button>
          )}
        </div>

        <p className="text-sm text-neutral-500 mb-4">{t('programs.subtitle')}</p>
        {coached && (
          <p className="text-sm text-neutral-400 mb-4">{t('programs.clientLocked')}</p>
        )}

        {loading ? (
          <ListSkeleton count={2} />
        ) : programsError && programs.length === 0 ? (
          <ErrorState
            title={t('errors.loadPrograms')}
            onRetry={() => { if (user) void fetchPrograms(user.id); }}
          />
        ) : programs.length === 0 ? (
          <EmptyState
            title={coached ? t('programs.clientLocked') : t('programs.empty')}
            body={coached ? undefined : t('programs.emptyBody')}
            action={isCoach ? (
              <Button type="button" size="sm" onClick={() => navigate('/programs/new')}>{t('programs.createFirst')}</Button>
            ) : undefined}
          />
        ) : (
          <div className="space-y-3">
            {programsError && (
              <ErrorState
                title={t('errors.loadPrograms')}
                onRetry={() => { if (user) void fetchPrograms(user.id); }}
              />
            )}
            {programs.map(p => {
              const exerciseCount = (p.days ?? []).reduce((n, d) => n + (d.exercises?.length ?? 0), 0);
              const sessionCount = (p.days ?? []).filter(d => d.name).length;
              return (
              <Card key={p.id}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {isCoach ? (
                      <Link to={`/programs/${p.id}`} className="font-semibold text-white hover:text-blue-300">
                        {p.name}
                      </Link>
                    ) : (
                    <p className="font-semibold text-white">{p.name}</p>
                    )}
                    <p className="text-sm text-neutral-400 mt-1">
                      {t('programs.sessionsPerWeek', { n: sessionCount || (p.days ?? []).length })}
                      {' · '}
                      {t('programs.weeksCount', { n: p.duration_weeks })}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(p.days ?? []).filter(d => d.name).map(d => (
                        <span key={d.id} className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                          {weekdayLabel(d.weekday)}: {d.name}
                        </span>
                      ))}
                      {exerciseCount === 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                          {t('programs.noExercises')}
                        </span>
                      )}
                    </div>
                  </div>
                  {isCoach && (
                    <OverflowMenu
                      label={t('programs.moreActions')}
                      actions={[
                        { id: 'open', label: t('common.edit'), onSelect: () => navigate(`/programs/${p.id}`) },
                        { id: 'duplicate', label: t('programs.duplicate'), onSelect: () => {
                          void duplicateProgram(p.id).then(result => {
                            if (result.error) toast(t('programs.duplicateFailed'), 'error');
                            else toast(t('programs.duplicated'));
                          });
                        } },
                        { id: 'assign', label: t('programs.assign'), onSelect: () => { setAssigningId(p.id); setAssignClient(''); } },
                        { id: 'delete', label: t('common.delete'), danger: true, onSelect: () => {
                          void deleteProgram(p.id).then(result => {
                            if (result.error) toast(t('programs.deleteFailed'), 'error');
                            else toast(t('programs.deleted'));
                          });
                        } },
                      ]}
                    />
                  )}
                </div>
              </Card>
              );
            })}
          </div>
        )}

        {isCoach && (
        <p className="mt-6 text-sm text-neutral-500">{t('programs.templatesHint')}</p>
        )}
        {isCoach && (
        <button type="button" onClick={() => navigate('/routines')} className="mt-2 min-h-11 text-sm text-blue-400">
          {t('programs.manageRoutines')}
        </button>
        )}
      </div>

      <Modal open={isCoach && showForm} onClose={() => setShowForm(false)} title={t('programs.newTitle')}>
        <div className="space-y-4">
          <Input label={t('programs.name')} value={name} onChange={e => setName(e.target.value)} placeholder={t('options.placeholders.programName')} />
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
            <option value="">{t('programs.pickClientFirst')}</option>
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
          {assignClient && assigningId && (
            <p className="text-sm text-neutral-300">
              {t('programs.assignRecap', {
                program: programs.find(p => p.id === assigningId)?.name ?? t('programs.title'),
                client: clients.find(c => c.id === assignClient)?.full_name
                  || clients.find(c => c.id === assignClient)?.email
                  || t('programs.pickClientFirst'),
                date: assignStartLabel(assignDate, i18n.language),
              })}
            </p>
          )}
          <Button onClick={handleAssign} disabled={!assignClient} className="w-full">{t('programs.assign')}</Button>
        </div>
      </Modal>
    </PageTransition>
  );
}
