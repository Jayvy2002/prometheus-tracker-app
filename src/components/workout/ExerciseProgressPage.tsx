import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, TrendingUp, Trophy, Search, ChevronRight, Dumbbell, Scale, CalendarDays, BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { parseDate, toLocalDateStr, formatChartDate, formatWeekdayShort } from '../../lib/utils';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import Card from '../ui/Card';
import CardLink from '../ui/CardLink';
import PageTransition from '../ui/PageTransition';

interface ExerciseEntry {
  date: string;
  maxWeight: number;
  totalVolume: number;
  estimated1RM: number;
  sets: number;
}

interface ExerciseSummary {
  name: string;
  entries: ExerciseEntry[];
  latest1RM: number;
  best1RM: number;
  trend: number;
  totalSessions: number;
}

function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export default function ExerciseProgressPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [allData, setAllData] = useState<ExerciseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    supabase
      .from('workout_exercises')
      .select(`
        name,
        workout_sets(weight_kg, reps, set_type, completed),
        workouts!inner(user_id, date, completed)
      `)
      .eq('workouts.user_id', user.id)
      .then(({ data }) => {
        if (!data) { setLoading(false); return; }

        const byExercise: Record<string, Record<string, { maxWeight: number; totalVolume: number; best1RM: number; sets: number }>> = {};

        for (const ex of data as unknown as {
          name: string;
          workout_sets: { weight_kg: number; reps: number; set_type: string; completed: boolean }[];
          workouts: { date: string; completed: boolean };
        }[]) {
          const name = ex.name;
          if (!byExercise[name]) byExercise[name] = {};
          const dateKey = toLocalDateStr(parseDate(ex.workouts.date));
          if (!byExercise[name][dateKey]) {
            byExercise[name][dateKey] = { maxWeight: 0, totalVolume: 0, best1RM: 0, sets: 0 };
          }
          for (const s of (ex.workout_sets ?? [])) {
            if (s.set_type === 'warmup') continue;
            if (!s.completed && !ex.workouts.completed) continue;
            const w = s.weight_kg || 0;
            const r = s.reps || 0;
            if (w === 0) continue;
            byExercise[name][dateKey].maxWeight = Math.max(byExercise[name][dateKey].maxWeight, w);
            byExercise[name][dateKey].totalVolume += w * r;
            byExercise[name][dateKey].best1RM = Math.max(byExercise[name][dateKey].best1RM, estimate1RM(w, r));
            byExercise[name][dateKey].sets++;
          }
        }

        const summaries: ExerciseSummary[] = Object.entries(byExercise)
          .map(([name, dates]) => {
            const entries: ExerciseEntry[] = Object.entries(dates)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, d]) => ({
                date,
                maxWeight: Math.round(d.maxWeight * 10) / 10,
                totalVolume: Math.round(d.totalVolume),
                estimated1RM: d.best1RM,
                sets: d.sets,
              }))
              .filter(e => e.sets > 0);

            if (entries.length === 0) return null;

            const latest1RM = entries[entries.length - 1].estimated1RM;
            const best1RM = Math.max(...entries.map(e => e.estimated1RM));
            const prev1RM = entries.length >= 2 ? entries[entries.length - 2].estimated1RM : latest1RM;
            const trend = prev1RM > 0 ? Math.round(((latest1RM - prev1RM) / prev1RM) * 100) : 0;

            return { name, entries, latest1RM, best1RM, trend, totalSessions: entries.length };
          })
          .filter(Boolean) as ExerciseSummary[];

        summaries.sort((a, b) => b.totalSessions - a.totalSessions);
        setAllData(summaries);
        setLoading(false);
      });
  }, [user]);

  const topExercises = useMemo(() => allData.slice(0, 5), [allData]);

  const filteredExercises = useMemo(() => {
    if (!searchQuery.trim()) return allData;
    const q = searchQuery.toLowerCase();
    return allData.filter(e => e.name.toLowerCase().includes(q));
  }, [allData, searchQuery]);

  const detail = selectedExercise ? allData.find(e => e.name === selectedExercise) : null;

  if (selectedExercise && detail) {
    const chartData = detail.entries.slice(-20).map(e => ({
      date: formatChartDate(e.date, i18n.language),
      '1RM': e.estimated1RM,
      volume: e.totalVolume,
    }));
    const isNewPR = detail.latest1RM === detail.best1RM && detail.entries.length > 1;

    return (
      <PageTransition>
        <div className="px-4 pt-6 pb-28">
          <div className="flex items-center gap-3 mb-5 animate-fade-in-down">
            <button onClick={() => setSelectedExercise(null)} className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg font-bold text-white flex-1 truncate">{detail.name}</h1>
          </div>

          {/* Big 1RM display */}
          <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-5 mb-4 text-center animate-fade-in-up">
            <p className="text-xs text-neutral-500 mb-1">{t('progress.estimated1RM')}</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-4xl font-bold text-white">{detail.latest1RM}</span>
              <span className="text-lg text-neutral-500">kg</span>
              {isNewPR && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold ml-2">
                  <Trophy size={12} /> PR
                </span>
              )}
            </div>
            {detail.trend !== 0 && (
              <div className={`inline-flex items-center gap-1 mt-2 text-xs font-medium px-2 py-0.5 rounded-lg
                ${detail.trend > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                <TrendingUp size={11} className={detail.trend < 0 ? 'rotate-180' : ''} />
                {detail.trend > 0 ? '+' : ''}{detail.trend}% {t('progress.vsLastSession')}
              </div>
            )}
            <div className="flex items-center justify-center gap-4 mt-3 text-xs text-neutral-500">
              <span>{t('progress.bestEver')}: <span className="text-amber-400 font-semibold">{detail.best1RM} kg</span></span>
              <span>{detail.totalSessions} {t('progress.sessions')}</span>
            </div>
          </div>

          {/* Chart */}
          {chartData.length > 1 && (
            <Card className="mb-4 animate-fade-in-up stagger-2">
              <h3 className="text-xs font-medium text-neutral-400 mb-3">{t('progress.progressionChart')}</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#737373' }} axisLine={false} tickLine={false} />
                    <YAxis domain={['dataMin - 5', 'dataMax + 5']} tick={{ fontSize: 9, fill: '#737373' }} axisLine={false} tickLine={false} width={35} />
                    <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', fontSize: 11 }} />
                    <Line type="monotone" dataKey="1RM" stroke="#2563eb" strokeWidth={2} dot={{ r: 3, fill: '#2563eb' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Session history */}
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2 animate-fade-in-up stagger-3">{t('progress.recentSessions')}</h3>
          <div className="space-y-2">
            {[...detail.entries].reverse().slice(0, 10).map((e, i) => (
              <div key={e.date} className="animate-fade-in-up" style={{ animationDelay: `${i * 30}ms` }}>
                <Card>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">
                        {formatWeekdayShort(e.date, i18n.language)}
                      </p>
                      <p className="text-xs text-neutral-500">{e.sets} sets</p>
                    </div>
                    <div className="text-right space-y-0.5">
                      <p className="text-xs font-medium text-blue-400">{e.estimated1RM} kg <span className="text-neutral-600">1RM</span></p>
                      <p className="text-[11px] text-neutral-500">{e.maxWeight} kg max | {e.totalVolume} vol</p>
                    </div>
                    {e.estimated1RM === detail.best1RM && detail.entries.indexOf(e) < detail.entries.length - 1 && (
                      <Trophy size={12} className="text-amber-400 shrink-0" />
                    )}
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28">
        <div className="flex items-center gap-3 mb-5 animate-fade-in-down">
          <button onClick={() => navigate('/workout')} className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-white flex-1">{t('pages.progress')}</h1>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-6">
          <CardLink to="/stats">
            <p className="text-sm font-medium text-white flex items-center gap-2"><BarChart2 size={16} className="text-blue-400" />{t('nav.progressSummary')}</p>
          </CardLink>
          <CardLink to="/exercise-progress">
            <p className="text-sm font-medium text-white flex items-center gap-2"><Dumbbell size={16} className="text-blue-400" />{t('nav.progressTraining')}</p>
          </CardLink>
          <CardLink to="/weight">
            <p className="text-sm font-medium text-white flex items-center gap-2"><Scale size={16} className="text-blue-400" />{t('nav.progressMeasures')}</p>
          </CardLink>
          <CardLink to="/calendar">
            <p className="text-sm font-medium text-white flex items-center gap-2"><CalendarDays size={16} className="text-blue-400" />{t('nav.progressHistory')}</p>
          </CardLink>
        </div>

        {loading ? (
          <div className="text-center py-16 text-neutral-500">{t('common.loading')}</div>
        ) : allData.length === 0 ? (
          <Card className="text-center py-12">
            <Dumbbell className="mx-auto mb-3 text-neutral-600" size={32} />
            <p className="text-neutral-400">{t('progress.noDataYet')}</p>
            <p className="text-xs text-neutral-600 mt-1">{t('progress.noDataHint')}</p>
          </Card>
        ) : (
          <>
            {/* Top exercises */}
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3 animate-fade-in-up">{t('progress.topExercises')}</h2>
            <div className="space-y-3 mb-6">
              {topExercises.map((ex, i) => {
                const isNewPR = ex.latest1RM === ex.best1RM && ex.entries.length > 1;
                return (
                  <button
                    key={ex.name}
                    onClick={() => setSelectedExercise(ex.name)}
                    className="w-full text-left animate-fade-in-up"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <Card className="hover:border-neutral-700 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                          <Dumbbell size={16} className="text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{ex.name}</p>
                          <p className="text-[11px] text-neutral-500">{ex.totalSessions} {t('progress.sessions')}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-lg font-bold text-white">{ex.latest1RM}</span>
                            <span className="text-xs text-neutral-500">kg</span>
                            {isNewPR && <Trophy size={12} className="text-amber-400" />}
                          </div>
                          {ex.trend !== 0 && (
                            <span className={`text-[10px] font-medium ${ex.trend > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {ex.trend > 0 ? '+' : ''}{ex.trend}%
                            </span>
                          )}
                        </div>
                        <ChevronRight size={16} className="text-neutral-600 shrink-0" />
                      </div>
                    </Card>
                  </button>
                );
              })}
            </div>

            {/* All exercises with search */}
            {allData.length > 5 && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide">{t('progress.allExercises')}</h2>
                  <span className="text-[10px] text-neutral-600 bg-neutral-800 px-1.5 py-0.5 rounded">{allData.length}</span>
                </div>

                {/* Search */}
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={t('progress.searchPlaceholder')}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-600 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  {filteredExercises.slice(5).map(ex => (
                    <button
                      key={ex.name}
                      onClick={() => setSelectedExercise(ex.name)}
                      className="w-full text-left"
                    >
                      <Card className="hover:border-neutral-700 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{ex.name}</p>
                          </div>
                          <span className="text-sm font-semibold text-neutral-300">{ex.latest1RM} kg</span>
                          <ChevronRight size={14} className="text-neutral-600 shrink-0" />
                        </div>
                      </Card>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}
