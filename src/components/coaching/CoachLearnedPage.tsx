import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CoachAgentLesson, CoachAiRound } from '../../lib/types';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function snapBody(snap: unknown): string {
  const o = asRecord(snap);
  const body = [o.body, o.notes, o.answer, o.suggestion, o.title]
    .find(v => typeof v === 'string' && v.trim()) as string | undefined;
  return body?.trim().slice(0, 180) ?? '';
}

function lessonKindKey(kind: string): string {
  const known = [
    'keep_in_touch',
    'calorie_adjustment',
    'adherence_nutrition',
    'adherence_training',
    'onboarding_plan',
    'ask_prometheus',
    'program_nl_edit',
    'program_adjustment',
  ];
  return known.includes(kind) ? `coaching.learned.kinds.${kind}` : 'coaching.learned.kinds.other';
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
          .select('id, coach_id, kind, proposed, accepted, note, intervention_id, disabled, created_at')
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

  // I05 : leçons corrigeables (suppression) et désactivables (ignorées par l'agent).
  const toggleLesson = async (row: CoachAgentLesson) => {
    const next = !row.disabled;
    const { error } = await supabase
      .from('coach_agent_lessons')
      .update({ disabled: next })
      .eq('id', row.id);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    setLessons(prev => prev.map(l => (l.id === row.id ? { ...l, disabled: next } : l)));
  };

  const deleteLesson = async (row: CoachAgentLesson) => {
    const { error } = await supabase.from('coach_agent_lessons').delete().eq('id', row.id);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    setLessons(prev => prev.filter(l => l.id !== row.id));
  };

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
                    <Card key={row.id} className={`space-y-1.5 ${row.disabled ? 'opacity-60' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-white">{t(lessonKindKey(row.kind))}</p>
                        <p className="text-xs text-neutral-500">{formatWhen(row.created_at, loc)}</p>
                      </div>
                      {snapBody(row.accepted) || snapBody(row.proposed) ? (
                        <p className="text-sm text-neutral-300">{snapBody(row.accepted) || snapBody(row.proposed)}</p>
                      ) : null}
                      {row.note?.trim() ? (
                        <p className="text-xs text-amber-200/90">{row.note.trim()}</p>
                      ) : null}
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => void toggleLesson(row)}
                          className="text-[11px] text-neutral-400 [@media(hover:hover)]:hover:text-white"
                        >
                          {row.disabled ? t('coaching.learned.enable') : t('coaching.learned.correct')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteLesson(row)}
                          className="text-[11px] text-neutral-500 [@media(hover:hover)]:hover:text-red-400"
                        >
                          {t('coaching.learned.delete')}
                        </button>
                        {row.disabled ? (
                          <span className="text-[10px] text-neutral-600">{t('coaching.learned.disabledHint')}</span>
                        ) : null}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {rounds[0] && (
              <p className="text-sm text-neutral-500">
                {formatWhen(rounds[0].started_at, loc)}
              </p>
            )}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
