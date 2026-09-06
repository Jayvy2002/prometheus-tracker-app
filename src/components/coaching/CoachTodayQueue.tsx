import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck } from 'lucide-react';
import { useCoachingStore } from '../../stores/coachingStore';
import {
  draftQueueItems,
  groupQueueByClient,
  lastMessageForClient,
  matchingPendingIntervention,
  queueItemLabelKey,
  relanceHrefForGroup,
  resolveQueueAction,
  visibleQueueItems,
} from '../../lib/coachQueue';
import { todayStr } from '../../lib/utils';
import { clientFileHref } from '../../lib/coachSituation';
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

  const groups = useMemo(() => {
    const dismissed = new Set(queueDismissedIds);
    const local = visibleQueueItems(priorities, queueDismissedIds, clients, todayStr());
    const drafts = draftQueueItems(pendingInterventions, priorities, clients).filter(item => !dismissed.has(item.id));
    return groupQueueByClient([...local, ...drafts]);
  }, [priorities, pendingInterventions, queueDismissedIds, clients]);

  if (groups.length === 0) {
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
        <p className="text-xs text-neutral-500">{t('coaching.queue.remaining', { count: groups.length })}</p>
      </div>

      <div className="space-y-2">
        {groups.map(group => {
          const relanceHref = relanceHrefForGroup(group, pendingInterventions);
          const sessionAction = group.items.find(item => item.kind === 'session_logged') ?? null;
          const recoveryAction = group.items.find(item => (
            item.kind === 'new_pain'
            || item.kind === 'low_sleep'
            || item.kind === 'high_stress'
            || item.kind === 'low_mood'
            || item.kind === 'high_hunger'
          )) ?? null;
          const setupAction = group.items
            .map(item => resolveQueueAction(item, pendingInterventions))
            .find(a => a.kind === 'open_setup' || a.kind === 'open_draft');
          const lastMessage = lastMessageForClient(sentMessages, group.clientId);
          return (
            <Card key={group.clientId} className="!p-4">
              <div className="flex items-start gap-3">
                <span className="text-lg leading-6 shrink-0" aria-hidden>{SEVERITY_DOT[group.severity]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {group.avatarUrl ? (
                      <img src={group.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : null}
                    <p className="text-sm font-medium text-white truncate">{group.clientName}</p>
                  </div>
                  <ul className="space-y-1.5">
                    {group.items.map((item: CoachPriority) => {
                      const draft = matchingPendingIntervention(item, pendingInterventions);
                      const action = resolveQueueAction(item, pendingInterventions);
                      const href = action.kind === 'open_draft' && action.href ? action.href : item.href;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => navigate(href)}
                            className="w-full text-left flex items-start gap-2 rounded-lg px-1 py-0.5 hover:bg-neutral-800/60"
                          >
                            <span className="text-[11px] leading-5 shrink-0" aria-hidden>{SEVERITY_DOT[item.severity]}</span>
                            <span className="text-xs text-neutral-300 min-w-0">
                              {t(queueItemLabelKey(item), item.headlineParams)}
                              {draft && item.kind !== 'draft_pending' ? (
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
                {recoveryAction?.href && (
                  <Button
                    size="sm"
                    variant={sessionAction ? 'secondary' : 'primary'}
                    onClick={() => navigate(recoveryAction.href)}
                  >
                    {t('coaching.queue.openRecovery')}
                  </Button>
                )}
                {relanceHref && (
                  <Button
                    size="sm"
                    variant={sessionAction || recoveryAction ? 'secondary' : 'primary'}
                    onClick={() => navigate(relanceHref)}
                  >
                    {t('coaching.queue.relance')}
                  </Button>
                )}
                {!relanceHref && !sessionAction && !recoveryAction && setupAction?.href && (
                  <Button size="sm" onClick={() => navigate(setupAction.href!)}>
                    {t(setupAction.ctaKey)}
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => navigate(clientFileHref(group.clientId))}>
                  {t('coaching.command.openClient')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dismissQueueItems(group.items.map(item => item.id))}
                >
                  {t('coaching.queue.skip')}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
