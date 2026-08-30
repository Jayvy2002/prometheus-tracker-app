import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { answerCoachAsk, clientsFilterHref, isRosterAsk, parseCoachAsk } from '../../lib/coachAsk';
import { interventionHref } from '../../lib/coachInterventions';
import { displayName } from '../../lib/coachText';
import {
  interventionDraftError,
  isInterventionDrafting,
  isInterventionReady,
  routeCoachSecondRequest,
} from '../../lib/coachSecond';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';
import SecondDraftingCard from './SecondDraftingCard';
import { interventionLiveLabel } from '../../lib/coachSecond';

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
    fetchCoachOps, askSecond, clients, runFleetRound, fleetRunning,
  } = useCoachingStore();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [sending, setSending] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get('q') || '';
    if (q && q !== query) setQuery(q);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    if (opsRows.length === 0) fetchCoachOps();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const rosterAnswer = useMemo(() => {
    const q = query.trim();
    if (!q || !isRosterAsk(q)) return null;
    return answerCoachAsk(parseCoachAsk(q), opsRows, priorities, rosterSignals);
  }, [query, opsRows, priorities, rosterSignals]);

  const live = pendingInterventions.find(row => row.id === activeId)
    ?? pendingInterventions.find(row => (
      (row.kind === 'ask_prometheus' || row.kind === 'onboarding_plan' || row.kind === 'program_nl_edit')
      && (isInterventionDrafting(row) || isInterventionReady(row) || interventionDraftError(row))
    ))
    ?? null;

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
    const matched = intent.type === 'client' || intent.type === 'client_lift'
      ? opsRows.find(r => displayName(r.client).toLowerCase().includes(q.toLowerCase().slice(0, 12)))
      : null;
    const clientId = clientHint
      || matched?.client.id
      || (opsRows.length === 1 ? opsRows[0].client.id : null);
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
    const result = await askSecond({
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
    if ('error' in result) {
      toast(t('coaching.second.failed'), 'error');
      return;
    }
    setActiveId(result.id);
  };

  const run = (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setQuery(q);
    remember(q);
    if (isRosterAsk(q)) return;
    void sendToSecond(q);
  };

  const drafts = pendingInterventions.slice(0, 8);

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28 md:px-6">
        <p className="text-[11px] uppercase tracking-wider text-blue-300 mb-1">Prometheus</p>
        <h1 className="text-2xl font-bold text-white mb-1">{t('coaching.ask.title')}</h1>
        <p className="text-sm text-neutral-500 mb-4">{t('coaching.ask.subtitle')}</p>

        <Card className="mb-5 space-y-2">
          <p className="text-sm font-medium text-white">{t('coaching.fleet.title')}</p>
          <p className="text-xs text-neutral-400">{t('coaching.fleet.hint')}</p>
          <Button
            size="sm"
            variant="secondary"
            loading={fleetRunning}
            onClick={async () => {
              const result = await runFleetRound();
              if (result.error) {
                toast(t('coaching.fleet.failed'), 'error');
                return;
              }
              toast(t('coaching.fleet.done', {
                flagged: result.clients_flagged ?? 0,
                skipped: result.clients_skipped ?? 0,
              }));
            }}
          >
            {t('coaching.fleet.run')}
          </Button>
        </Card>

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

        <div className="flex flex-wrap gap-2 mb-5">
          {['coaching.ask.examples.stalled', 'coaching.ask.examples.pain', 'coaching.ask.examples.adherence', 'coaching.ask.examples.program'].map(key => (
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

        {live && (isInterventionDrafting(live) || interventionDraftError(live)) && (
          <SecondDraftingCard
            row={live}
            retrying={sending}
            onRetry={interventionDraftError(live) ? () => void sendToSecond(query) : undefined}
          />
        )}

        {live && isInterventionReady(live) && (
          <Card className="mb-5 space-y-2 border-blue-500/20" onClick={() => navigate(interventionHref(live))}>
            <p className="text-sm font-medium text-white">{t('coaching.second.landed')}</p>
            <p className="text-xs text-neutral-400">{live.title || t(`coaching.interventions.kinds.${live.kind}`)}</p>
            <p className="text-[11px] text-blue-400">{t('coaching.ask.openDraft')}</p>
          </Card>
        )}

        {rosterAnswer && (
          <Card className="mb-5 space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-neutral-500">{t('coaching.ask.rosterFilter')}</p>
            <p className="text-sm font-medium text-white">{t(rosterAnswer.titleKey, rosterAnswer.titleParams)}</p>
            <p className="text-sm text-neutral-300">{t(rosterAnswer.bodyKey, rosterAnswer.bodyParams)}</p>
            {rosterAnswer.hits.length > 0 && (
              <div className="space-y-1">
                {rosterAnswer.hits.map(hit => (
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
            {rosterAnswer.filter && (
              <button
                type="button"
                onClick={() => navigate(clientsFilterHref(rosterAnswer.filter!))}
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
                      {interventionLiveLabel(item, t) ? ` · ${interventionLiveLabel(item, t)}` : ''}
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
