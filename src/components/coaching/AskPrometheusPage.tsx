import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { answerCoachAsk, clientsFilterHref, parseCoachAsk } from '../../lib/coachAsk';
import { interventionHref } from '../../lib/coachInterventions';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';

const ASK_HISTORY_KEY = 'prometheus_coach_ask_history';

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(ASK_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: string[]) {
  try {
    localStorage.setItem(ASK_HISTORY_KEY, JSON.stringify(items.slice(0, 8)));
  } catch {
    // ignore
  }
}

export default function AskPrometheusPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const {
    opsRows, priorities, rosterSignals, pendingInterventions,
    fetchCoachOps, createIntervention, clients,
  } = useCoachingStore();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const q = searchParams.get('q') || '';
    if (q && q !== query) setQuery(q);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    if (opsRows.length === 0) fetchCoachOps();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    return answerCoachAsk(parseCoachAsk(q), opsRows, priorities, rosterSignals);
  }, [query, opsRows, priorities, rosterSignals]);

  const run = (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setQuery(q);
    const next = [q, ...history.filter(h => h !== q)].slice(0, 8);
    setHistory(next);
    saveHistory(next);
  };

  const sendToSecond = async () => {
    if (!query.trim()) return;
    setSending(true);
    const clientHint = searchParams.get('client');
    const result = await createIntervention({
      clientId: clientHint,
      kind: 'other',
      title: t('coaching.ask.secondDraftTitle'),
      rationale: query.trim(),
      payload: {
        question: query.trim(),
        local_answer: answer ? t(answer.bodyKey, answer.bodyParams) : '',
        hook: 'second',
      },
      source: 'prometheus_ask_second_hook',
    });
    setSending(false);
    if ('error' in result) {
      toast(result.error, 'error');
      return;
    }
    toast(t('coaching.ask.sentToSecond'));
    navigate(`/inbox/${result.id}`);
  };

  const drafts = pendingInterventions.slice(0, 8);

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28 md:px-6">
        <p className="text-[11px] uppercase tracking-wider text-blue-300 mb-1">Prometheus</p>
        <h1 className="text-2xl font-bold text-white mb-1">{t('coaching.ask.title')}</h1>
        <p className="text-sm text-neutral-500 mb-4">{t('coaching.ask.subtitle')}</p>

        <form
          onSubmit={e => { e.preventDefault(); run(query); }}
          className="flex gap-2 mb-4"
        >
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('coaching.ask.placeholder')}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white"
            />
          </div>
          <Button type="submit" size="sm">{t('coaching.ask.run')}</Button>
        </form>

        <div className="flex flex-wrap gap-2 mb-5">
          {['coaching.ask.examples.stalled', 'coaching.ask.examples.pain', 'coaching.ask.examples.adherence'].map(key => (
            <button
              key={key}
              type="button"
              onClick={() => run(t(key))}
              className="text-[11px] px-2.5 py-1 rounded-full bg-neutral-900 text-neutral-300 hover:text-white"
            >
              {t(key)}
            </button>
          ))}
        </div>

        {answer && (
          <Card className="mb-5 space-y-3">
            <p className="text-sm font-medium text-white">{t(answer.titleKey, answer.titleParams)}</p>
            <p className="text-sm text-neutral-300">{t(answer.bodyKey, answer.bodyParams)}</p>
            {answer.hits.length > 0 && (
              <div className="space-y-1">
                {answer.hits.map(hit => (
                  <button
                    key={`${hit.clientId}-${hit.href}`}
                    type="button"
                    onClick={() => navigate(hit.href)}
                    className="w-full flex items-center gap-2 text-left px-2 py-2 rounded-lg hover:bg-neutral-800/80"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{hit.clientName}</p>
                      <p className="text-[11px] text-neutral-500 truncate">{hit.reason}</p>
                    </div>
                    <ChevronRight size={14} className="text-neutral-600" />
                  </button>
                ))}
              </div>
            )}
            {answer.filter && (
              <button
                type="button"
                onClick={() => navigate(clientsFilterHref(answer.filter!))}
                className="text-xs text-blue-400"
              >
                {t('coaching.ask.filterClients')}
              </button>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-neutral-600 mb-1">{t('coaching.ask.dataUsed')}</p>
              <p className="text-[11px] text-neutral-500">{answer.dataUsed.join(' · ') || '—'}</p>
            </div>
            {answer.secondHook && (
              <div className="rounded-xl border border-dashed border-violet-500/30 p-3">
                <p className="text-[11px] text-violet-300 mb-1">{t('coaching.ask.secondHookTitle')}</p>
                <p className="text-xs text-neutral-400 mb-2">{t('coaching.ask.secondHookBody')}</p>
                <Button size="sm" variant="secondary" loading={sending} onClick={sendToSecond}>
                  {t('coaching.ask.sendToSecond')}
                </Button>
              </div>
            )}
          </Card>
        )}

        {history.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">{t('coaching.ask.recent')}</p>
            <div className="flex flex-wrap gap-2">
              {history.map(h => (
                <button key={h} type="button" onClick={() => run(h)} className="text-[11px] px-2 py-1 rounded-lg bg-neutral-900 text-neutral-400">
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">{t('coaching.ask.drafts')}</p>
        {drafts.length === 0 ? (
          <p className="text-sm text-neutral-500">{t('coaching.ask.noDrafts')}</p>
        ) : (
          <div className="space-y-2">
            {drafts.map(item => {
              const client = clients.find(c => c.id === item.client_id);
              return (
                <Card key={item.id} onClick={() => navigate(interventionHref(item))} className="flex items-start gap-3">
                  <Sparkles size={14} className="text-blue-400 mt-1" />
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{item.title || t(`coaching.interventions.kinds.${item.kind}`)}</p>
                    <p className="text-[11px] text-neutral-500 truncate">
                      {client?.full_name || client?.email || t('coaching.interventions.appWide')}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
