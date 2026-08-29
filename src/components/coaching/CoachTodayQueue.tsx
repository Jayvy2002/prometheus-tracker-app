import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck } from 'lucide-react';
import { useCoachingStore } from '../../stores/coachingStore';
import {
  groupQueueByClient,
  lastMessageForClient,
  matchingPendingIntervention,
  nextClientNames,
  queueItemLabelKey,
  relanceHrefForGroup,
  resolveQueueAction,
  visibleQueueItems,
} from '../../lib/coachQueue';
import { todayStr } from '../../lib/utils';
import type { CoachPriority, CoachPrioritySeverity } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';

const SEVERITY_DOT: Record<CoachPrioritySeverity, string> = {
  red: '🔴',
  orange: '🟠',
  yellow: '🟡',
};

export default function CoachTodayQueue() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    priorities, pendingInterventions, clients, queueDismissedIds, sentMessages, dismissQueueItems,
  } = useCoachingStore();

  const groups = useMemo(
    () => groupQueueByClient(visibleQueueItems(priorities, queueDismissedIds, clients, todayStr())),
    [priorities, queueDismissedIds, clients],
  );
  const current = groups[0] ?? null;
  const upcomingNames = nextClientNames(groups);
  const relanceHref = current ? relanceHrefForGroup(current, pendingInterventions) : null;
  const sessionAction = current?.items.find(item => item.kind === 'session_logged') ?? null;
  const setupAction = current
    ? current.items.map(item => resolveQueueAction(item, pendingInterventions)).find(a => a.kind === 'open_setup' || a.kind === 'open_draft')
    : null;
  const lastMessage = current ? lastMessageForClient(sentMessages, current.clientId) : null;

  const skipClient = () => {
    if (!current) return;
    dismissQueueItems(current.items.map(item => item.id));
  };

  if (!current) {
    return (
      <Card className="flex items-center gap-3">
        <ClipboardCheck size={18} className="text-emerald-400" />
        <div>
          <p className="text-sm text-white">{t('coaching.command.allClearTitle')}</p>
          <p className="text-xs text-neutral-500">{t('coaching.command.allClearBody')}</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">
          {t('coaching.queue.title')}
        </p>
        <div className="flex items-center gap-3">
          <p className="text-xs text-neutral-500">{t('coaching.queue.remaining', { count: groups.length })}</p>
          <button type="button" onClick={() => navigate('/clients')} className="text-xs text-blue-400">
            {t('nav.clients')}
          </button>
        </div>
      </div>

      <Card className="!p-4">
        <div className="flex items-start gap-3">
          <span className="text-lg leading-6 shrink-0" aria-hidden>{SEVERITY_DOT[current.severity]}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {current.avatarUrl ? (
                <img src={current.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
              ) : null}
              <p className="text-sm font-medium text-white truncate">{current.clientName}</p>
            </div>
            <ul className="space-y-1.5">
              {current.items.map((item: CoachPriority) => {
                const draft = matchingPendingIntervention(item, pendingInterventions);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => navigate(item.href)}
                      className="w-full text-left flex items-start gap-2 rounded-lg px-1 py-0.5 hover:bg-neutral-800/60"
                    >
                      <span className="text-[11px] leading-5 shrink-0" aria-hidden>{SEVERITY_DOT[item.severity]}</span>
                      <span className="text-xs text-neutral-300 min-w-0">
                        {t(queueItemLabelKey(item.kind), item.headlineParams)}
                        {draft ? (
                          <span className="text-blue-400"> · {t('coaching.queue.draftBadge')}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {lastMessage?.body ? (
              <p className="text-[11px] text-neutral-500 truncate mt-2 px-1">
                {lastMessage.body}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          {sessionAction?.href && (
            <Button size="sm" onClick={() => navigate(sessionAction.href)}>
              {t('coaching.queue.openSession')}
            </Button>
          )}
          {relanceHref && (
            <Button size="sm" variant={sessionAction ? 'secondary' : 'primary'} onClick={() => navigate(relanceHref)}>
              {t('coaching.queue.relance')}
            </Button>
          )}
          {!relanceHref && !sessionAction && setupAction?.href && (
            <Button size="sm" onClick={() => navigate(setupAction.href!)}>
              {t(setupAction.ctaKey)}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => navigate(`/clients/${current.clientId}`)}>
            {t('coaching.command.openClient')}
          </Button>
          <Button variant="ghost" size="sm" onClick={skipClient}>
            {t('coaching.queue.skip')}
          </Button>
        </div>
      </Card>

      {upcomingNames.length > 0 && (
        <p className="text-[11px] text-neutral-600 mt-2 px-1">
          {t('coaching.queue.nextUp', { names: upcomingNames.join(' · ') })}
        </p>
      )}
    </>
  );
}
