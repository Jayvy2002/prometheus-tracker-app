import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { answerCoachAsk, clientsFilterHref, isRosterAsk, parseCoachAsk, resolveAskClientId, rosterHitsForFilter } from '../../lib/coachAsk';
import { openDraftHref } from '../../lib/coachInterventions';
import { routeCoachSecondRequest } from '../../lib/coachSecond';
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
    opsRows, priorities, rosterSignals,
    fetchCoachOps, askCoachAgent,
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

  const localAnswer = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    return answerCoachAsk(parseCoachAsk(q), opsRows, priorities, rosterSignals);
  }, [query, opsRows, priorities, rosterSignals]);

  const remember = (q: string) => {
    const next = [q, ...history.filter(h => h !== q)].slice(0, 8);
    setHistory(next);
    saveHistory(next);
  };

  const sendToSecond = async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    remember(q);
    setQuery(q);
    const clientHint = searchParams.get('client');
    const intent = parseCoachAsk(q);
    const clientId = resolveAskClientId(intent, opsRows, q, clientHint);
    const onboarded = clientId
      ? opsRows.find(r => r.client.id === clientId)?.client.onboarding_completed
      : undefined;
    const route = routeCoachSecondRequest(q, {
      onboarded: onboarded !== false,
      hasProgram: !!searchParams.get('program'),
    });
    const kind = route.kind === 'roster' || (route.kind === 'onboarding_plan' && !clientId)
      ? 'ask_prometheus'
      : route.kind;
    setSending(true);
    const result = await askCoachAgent({
      kind,
      clientId,
      programId: searchParams.get('program'),
      prompt: q,
      screen: 'ask_prometheus',
      context: {
        tab: searchParams.get('tab') || 'ask',
        client_hint: clientHint,
      },
    });
    setSending(false);
    if ('error' in result || !result.id) {
      toast(t('coaching.second.failed'), 'error');
      return;
    }
    const href = openDraftHref({ kind, client_id: clientId, id: result.id }, { from: 'ask' });
    if (!href) {
      toast(t('coaching.second.failed'), 'error');
      return;
    }
    navigate(href);
  };

  const run = (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setQuery(q);
    remember(q);
    if (isRosterAsk(q)) return;
    void sendToSecond(q);
  };

  const askChips = useMemo(() => {
    const chips: Array<{ key: string; always?: boolean; filter?: 'stalled' | 'pain' | 'adherence' }> = [
      { key: 'coaching.ask.examples.stalled', filter: 'stalled' },
      { key: 'coaching.ask.examples.pain', filter: 'pain' },
      { key: 'coaching.ask.examples.adherence', filter: 'adherence' },
      { key: 'coaching.ask.examples.program', always: true },
    ];
    return chips.filter(chip => (
      chip.always
      || (chip.filter ? rosterHitsForFilter(chip.filter, opsRows, priorities, rosterSignals).length > 0 : false)
    ));
  }, [opsRows, priorities, rosterSignals]);

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28 md:px-6">
        <p className="text-[11px] uppercase tracking-wider text-blue-300 mb-1 pr-12 md:pr-0">Prometheus</p>
        <h1 className="text-2xl font-bold text-white mb-1 pr-12 md:pr-0">{t('coaching.ask.title')}</h1>
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
          <Button type="submit" size="sm" loading={sending}>{t('coaching.ask.run')}</Button>
        </form>

        {askChips.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {askChips.map(chip => (
              <button
                key={chip.key}
                type="button"
                onClick={() => run(t(chip.key))}
                className="text-[11px] px-2.5 py-1 rounded-full bg-neutral-900 text-neutral-300 hover:text-white"
              >
                {t(chip.key)}
              </button>
            ))}
          </div>
        )}

        {localAnswer && (
          <Card className="mb-5 space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-neutral-500">{t('coaching.ask.rosterFilter')}</p>
            <p className="text-sm font-medium text-white">{t(localAnswer.titleKey, localAnswer.titleParams)}</p>
            <p className="text-sm text-neutral-300">{t(localAnswer.bodyKey, localAnswer.bodyParams)}</p>
            {localAnswer.hits.length > 0 && (
              <div className="space-y-1">
                {localAnswer.hits.map(hit => (
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
            {localAnswer.filter && (
              <button
                type="button"
                onClick={() => navigate(clientsFilterHref(localAnswer.filter!))}
                className="text-xs text-blue-400"
              >
                {t('coaching.ask.filterClients')}
              </button>
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
      </div>
    </PageTransition>
  );
}
