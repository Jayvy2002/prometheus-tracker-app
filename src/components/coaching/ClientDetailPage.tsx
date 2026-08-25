import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Dumbbell, Scale, ClipboardCheck, MessageSquare, CalendarDays } from 'lucide-react';
import { useCoachingStore } from '../../stores/coachingStore';
import { useProgramStore } from '../../stores/programStore';
import { useAuthStore } from '../../stores/authStore';
import { formatDate, formatDuration, todayStr } from '../../lib/utils';
import type { DailyCheckin, NutritionLog, WaterLog, WeightMeasurement, Workout } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';

type Tab = 'workouts' | 'checkins' | 'nutrition' | 'weight' | 'notes';

export default function ClientDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    clients, fetchClients, fetchClientWorkouts, fetchClientWorkout,
    fetchClientNutrition, fetchClientWeight, fetchClientCheckins,
    fetchNotes, addNote, notes,
  } = useCoachingStore();
  const { programs, fetchPrograms, assignProgram } = useProgramStore();

  const [tab, setTab] = useState<Tab>('workouts');
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [openWorkout, setOpenWorkout] = useState<Workout | null>(null);
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [water, setWater] = useState<WaterLog[]>([]);
  const [weights, setWeights] = useState<WeightMeasurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteBody, setNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [assignId, setAssignId] = useState('');
  const [assignDate, setAssignDate] = useState(todayStr());
  const [assigning, setAssigning] = useState(false);

  const client = clients.find(c => c.id === id);

  useEffect(() => {
    if (!id) return;
    if (!clients.length) fetchClients();
    if (user) fetchPrograms(user.id);
    setLoading(true);
    Promise.all([
      fetchClientWorkouts(id).then(setWorkouts),
      fetchClientCheckins(id).then(setCheckins),
      fetchClientNutrition(id, todayStr()).then(r => { setLogs(r.logs); setWater(r.water); }),
      fetchClientWeight(id).then(setWeights),
      fetchNotes(id),
    ]).finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenWorkout = async (workoutId: string) => {
    const full = await fetchClientWorkout(workoutId);
    setOpenWorkout(full);
  };

  const handleNote = async () => {
    if (!id || !noteBody.trim()) return;
    setSavingNote(true);
    const { error } = await addNote(id, noteBody, {
      noteDate: todayStr(),
      workoutId: openWorkout?.id,
    });
    setSavingNote(false);
    if (error) {
      toast(error, 'error');
      return;
    }
    setNoteBody('');
    toast(t('coaching.noteSaved'));
  };

  const handleAssign = async () => {
    if (!id || !assignId) return;
    setAssigning(true);
    const { error } = await assignProgram(assignId, id, assignDate);
    setAssigning(false);
    if (error) {
      toast(error, 'error');
      return;
    }
    toast(t('programs.assigned'));
  };

  const completedThisWeek = workouts.filter(w => {
    if (!w.completed) return false;
    const d = new Date(w.date);
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return d >= monday;
  }).length;

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-8">
        <button onClick={() => navigate('/clients')} className="flex items-center gap-2 text-neutral-400 hover:text-white mb-4">
          <ArrowLeft size={18} /> {t('coaching.clientsTitle')}
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold">
            {client?.avatar_url
              ? <img src={client.avatar_url} alt="" className="w-full h-full object-cover" />
              : (client?.full_name?.[0] || '?').toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white truncate">{client?.full_name || t('coaching.unnamed')}</h1>
            <p className="text-xs text-neutral-500 truncate">{client?.email}</p>
          </div>
        </div>

        <p className="text-xs text-neutral-500 mb-4">
          {t('coaching.weekSessions', { count: completedThisWeek })}
          {workouts.filter(w => w.completed && w.program_day_id).length > 0
            ? ` · ${workouts.filter(w => w.completed && w.program_day_id).length} ${t('programs.assigned')}`
            : ''}
        </p>

        {programs.length > 0 && (
          <Card className="mb-4 space-y-2">
            <p className="text-sm font-medium text-white">{t('programs.assignToClient')}</p>
            <select
              value={assignId}
              onChange={e => setAssignId(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
            >
              <option value="">{t('programs.pickProgram')}</option>
              {programs.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={assignDate}
              onChange={e => setAssignDate(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
            />
            <Button size="sm" onClick={handleAssign} loading={assigning} disabled={!assignId} className="w-full">
              {t('programs.assign')}
            </Button>
          </Card>
        )}

        <div className="flex gap-1 overflow-x-auto mb-4 -mx-4 px-4 scrollbar-hide">
          {(['workouts', 'checkins', 'nutrition', 'weight', 'notes'] as Tab[]).map(key => (
            <button
              key={key}
              onClick={() => { setTab(key); setOpenWorkout(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                tab === key ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400'
              }`}
            >
              {t(`coaching.tabs.${key}`)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mt-8" />
        ) : tab === 'workouts' ? (
          openWorkout ? (
            <div className="space-y-3">
              <button onClick={() => setOpenWorkout(null)} className="text-sm text-blue-400">{t('common.back')}</button>
              <h2 className="text-lg font-semibold text-white">{openWorkout.name}</h2>
              <p className="text-xs text-neutral-500">
                {formatDate(openWorkout.date)}
                {openWorkout.duration_seconds > 0 ? ` · ${formatDuration(openWorkout.duration_seconds)}` : ''}
              </p>
              {(openWorkout.exercises ?? []).map(ex => (
                <Card key={ex.id} padding={false} className="p-3">
                  <p className="text-sm font-medium text-white mb-1">
                    {ex.name}
                    {ex.prescribed_sets ? (
                      <span className="text-neutral-500 font-normal"> · {ex.prescribed_sets}×{ex.prescribed_reps}</span>
                    ) : null}
                  </p>
                  {(ex.sets ?? []).map((s, i) => (
                    <p key={s.id} className="text-xs text-neutral-400">
                      {i + 1}. {s.weight_kg}kg × {s.reps}
                      {s.rir ? ` @ RIR ${s.rir}` : ''}
                    </p>
                  ))}
                </Card>
              ))}
              <div className="flex gap-2">
                <input
                  value={noteBody}
                  onChange={e => setNoteBody(e.target.value)}
                  placeholder={t('coaching.noteOnWorkout')}
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
                />
                <Button size="sm" onClick={handleNote} loading={savingNote}>{t('common.send')}</Button>
              </div>
            </div>
          ) : workouts.length === 0 ? (
            <Card className="text-center py-8 text-neutral-500">{t('coaching.empty.workouts')}</Card>
          ) : (
            <div className="space-y-2">
              {workouts.map(w => (
                <Card key={w.id} onClick={() => handleOpenWorkout(w.id)} className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${w.completed ? 'bg-blue-600/20 text-blue-400' : 'bg-neutral-800 text-neutral-500'}`}>
                    <Dumbbell size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{w.name || t('workout.title')}</p>
                    <p className="text-xs text-neutral-500">{formatDate(w.date)}</p>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : tab === 'checkins' ? (
          checkins.length === 0 ? (
            <Card className="text-center py-8 text-neutral-500">{t('coaching.empty.checkins')}</Card>
          ) : (
            <div className="space-y-2">
              {checkins.map(c => (
                <Card key={c.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardCheck size={14} className="text-blue-400" />
                    <p className="text-sm font-medium text-white">{c.checked_at}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px] text-neutral-400">
                    <span>{t('checkin.fields.energy_level')}: {c.energy_level ?? '—'}</span>
                    <span>{t('checkin.fields.sleep_quality')}: {c.sleep_quality ?? '—'}</span>
                    <span>{t('checkin.fields.stress')}: {c.stress ?? '—'}</span>
                    <span>{t('checkin.fields.motivation')}: {c.motivation ?? '—'}</span>
                    <span>{t('checkin.fields.fatigue')}: {c.fatigue ?? '—'}</span>
                    <span>{t('checkin.fields.mood')}: {c.mood ?? '—'}</span>
                  </div>
                  {c.notes && <p className="text-xs text-neutral-500 mt-2">{c.notes}</p>}
                </Card>
              ))}
            </div>
          )
        ) : tab === 'nutrition' ? (
          <Card>
            <p className="text-xs text-neutral-500 mb-2">{t('common.today')}</p>
            <p className="text-sm text-white mb-3">
              {Math.round(logs.reduce((s, l) => s + l.calories, 0))} kcal ·
              P {Math.round(logs.reduce((s, l) => s + l.protein, 0))}g ·
              C {Math.round(logs.reduce((s, l) => s + l.carbs, 0))}g ·
              F {Math.round(logs.reduce((s, l) => s + l.fat, 0))}g
            </p>
            <p className="text-xs text-neutral-500 mb-2">
              {t('coaching.water')}: {water.reduce((s, w) => s + w.amount_ml, 0)} ml
            </p>
            {logs.length === 0 ? (
              <p className="text-sm text-neutral-500">{t('coaching.empty.nutrition')}</p>
            ) : logs.map(l => (
              <p key={l.id} className="text-xs text-neutral-300 py-1 border-t border-neutral-800">
                {l.name} · {Math.round(l.calories)} kcal
              </p>
            ))}
          </Card>
        ) : tab === 'weight' ? (
          weights.length === 0 ? (
            <Card className="text-center py-8 text-neutral-500">{t('coaching.empty.weight')}</Card>
          ) : (
            <div className="space-y-2">
              {weights.map(w => (
                <Card key={w.id} className="flex items-center gap-3">
                  <Scale size={16} className="text-emerald-400" />
                  <span className="text-sm text-white font-medium">{w.weight_kg} kg</span>
                  <span className="text-xs text-neutral-500 ml-auto">{w.measured_at.slice(0, 10)}</span>
                </Card>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={noteBody}
                onChange={e => setNoteBody(e.target.value)}
                placeholder={t('coaching.noteOnDay')}
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
              />
              <Button size="sm" onClick={handleNote} loading={savingNote}>{t('common.send')}</Button>
            </div>
            {notes.length === 0 ? (
              <Card className="text-center py-8 text-neutral-500">{t('coaching.empty.notes')}</Card>
            ) : notes.map(n => (
              <Card key={n.id}>
                <div className="flex items-center gap-2 mb-1">
                  {n.workout_id ? <Dumbbell size={12} className="text-blue-400" /> : <CalendarDays size={12} className="text-neutral-500" />}
                  <span className="text-[10px] text-neutral-500">{n.note_date || n.created_at.slice(0, 10)}</span>
                </div>
                <p className="text-sm text-neutral-200">{n.body}</p>
              </Card>
            ))}
          </div>
        )}

        {tab !== 'notes' && tab !== 'workouts' && (
          <div className="mt-4 flex items-center gap-2 text-neutral-600">
            <MessageSquare size={14} />
            <span className="text-xs">{t('coaching.switchToNotes')}</span>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
