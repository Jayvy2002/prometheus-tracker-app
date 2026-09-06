import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CoachAgentLesson, CoachAiRound } from '../../lib/types';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function snapLabel(snap: unknown): string {
  const o = asRecord(snap);
  const body = [o.body, o.notes, o.answer, o.suggestion]
    .find(v => typeof v === 'string' && v.trim()) as string | undefined;
  if (body?.trim()) return body.trim().slice(0, 180);
  const keys = Object.keys(o).filter(k => k !== 'kind');
  return keys.length ? keys.slice(0, 6).join(', ') : '—';
}

function formatWhen(iso: string, locale: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleString(locale.startsWith('fr') ? 'fr-CA' : 'en-CA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CoachLearnedPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const loc = i18n.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const [lessons, setLessons] = useState<CoachAgentLesson[]>([]);
  const [rounds, setRounds] = useState<CoachAiRound[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [lessonRes, roundRes] = await Promise.all([
        supabase
          .from('coach_agent_lessons')
          .select('id, coach_id, kind, proposed, accepted, note, intervention_id, created_at')
          .order('created_at', { ascending: false })
          .limit(40),
        supabase
          .from('coach_ai_rounds')
          .select('id, coach_id, trigger, started_at, finished_at, clients_seen, clients_flagged, clients_skipped, model_used, error')
          .order('started_at', { ascending: false })
          .limit(20),
      ]);
      if (cancelled) return;
      setLessons((lessonRes.data ?? []) as CoachAgentLesson[]);
      setRounds((roundRes.data ?? []) as CoachAiRound[]);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28 max-w-lg mx-auto">
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 text-neutral-400 hover:text-white mb-4"
        >
          <ArrowLeft size={18} /> {t('nav.profile')}
        </button>
        <h1 className="text-xl font-bold text-white mb-1">{t('coaching.learned.title')}</h1>
        <p className="text-sm text-neutral-500 mb-6">{t('coaching.learned.subtitle')}</p>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">{t('coaching.learned.lessons')}</h2>
              {lessons.length === 0 ? (
                <p className="text-sm text-neutral-500">{t('coaching.learned.lessonsEmpty')}</p>
              ) : (
                <div className="space-y-2">
                  {lessons.map(row => (
                    <Card key={row.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-blue-300">{row.kind}</p>
                        <p className="text-[10px] text-neutral-600">{formatWhen(row.created_at, loc)}</p>
                      </div>
                      <p className="text-[11px] text-neutral-500">
                        {t('coaching.learned.proposed')}: <span className="text-neutral-300">{snapLabel(row.proposed)}</span>
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {t('coaching.learned.sent')}: <span className="text-neutral-200">{snapLabel(row.accepted)}</span>
                      </p>
                      {row.note?.trim() ? (
                        <p className="text-xs text-amber-200/90">{row.note.trim()}</p>
                      ) : null}
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">{t('coaching.learned.rounds')}</h2>
              {rounds.length === 0 ? (
                <p className="text-sm text-neutral-500">{t('coaching.learned.roundsEmpty')}</p>
              ) : (
                <div className="space-y-2">
                  {rounds.map(row => (
                    <Card key={row.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-white">
                          {row.trigger === 'cron' ? t('coaching.learned.cron') : t('coaching.learned.onDemand')}
                        </p>
                        <p className="text-[10px] text-neutral-600">{formatWhen(row.started_at, loc)}</p>
                      </div>
                      <p className="text-xs text-neutral-400">
                        {t('coaching.learned.roundStats', {
                          seen: row.clients_seen,
                          flagged: row.clients_flagged,
                          skipped: row.clients_skipped,
                        })}
                      </p>
                      {row.error ? (
                        <p className="text-[11px] text-rose-300">{row.error}</p>
                      ) : null}
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
