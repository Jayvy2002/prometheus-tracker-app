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
  nextClientNames,
  primaryQueueAction,
  queueActionHref,
  queueItemLabelKey,
  queueSinceCopy,
  queueSinceDays,
  visibleQueueItems,
} from '../../lib/coachQueue';
import { todayStr } from '../../lib/utils';
import { rosterChainState } from '../../lib/coachRoster';
import { clientFileHref } from '../../lib/coachSituation';
import type { CoachPrioritySeverity, CoachQueueClientGroup } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import ListRow from '../ui/ListRow';
import { toastWithUndo } from '../ui/Toast';

const SEVERITY_CLASS: Record<CoachPrioritySeverity, string> = {
  red: 'bg-rose-500/15 text-rose-300',
  orange: 'bg-amber-500/15 text-amber-300',
  yellow: 'bg-neutral-800 text-neutral-300',
};

export default function CoachTodayQueue() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    priorities, pendingInterventions, clients, queueDismissedIds, sentMessages, dismissQueueItems,
    restoreQueueItems,
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

  const nextNames = nextClientNames(groups).join(', ');
  const queueIds = groups.map(group => group.clientId);
  const openFromQueue = (href: string) => navigate(href, { state: rosterChainState('/dashboard', queueIds) });

  return (
    <>
      <div className="flex items-center justify-between mb-3 gap-3">
        <p className="text-sm font-semibold text-neutral-300">
          {t('coaching.queue.attentionCount', { count: groups.length })}
        </p>
        {nextNames ? (
          <p className="text-xs text-neutral-500 truncate">{t('coaching.queue.nextUp', { names: nextNames })}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        {groups.map((group, index) => (
          <QueueClientRow
            key={group.clientId}
            group={group}
            featured={index === 0}
            lastMessage={lastMessageForClient(sentMessages, group.clientId)?.body}
            onOpen={openFromQueue}
            onSkip={ids => {
              dismissQueueItems(ids);
              toastWithUndo(t('coaching.queue.skipped'), () => restoreQueueItems(ids));
            }}
          />
        ))}
      </div>
    </>
  );
}

function QueueClientRow({
  group,
  featured,
  lastMessage,
  onOpen,
  onSkip,
}: {
  group: CoachQueueClientGroup;
  featured: boolean;
  lastMessage: string | undefined;
  onOpen: (href: string) => void;
  onSkip: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const pending = useCoachingStore(s => s.pendingInterventions);
  const { item, action } = primaryQueueAction(group, pending);
  const href = queueActionHref(item, action);
  const draft = matchingPendingIntervention(item, pending);
  const extra = group.items.length - 1;
  const since = queueSinceCopy(queueSinceDays(item.sinceIso, todayStr()));
  const sinceLabel = since ? t(since.key, since.params) : null;
  const headline = (
    <>
      {t(queueItemLabelKey(item), item.headlineParams)}
      {draft && item.kind !== 'draft_pending' ? (
        <span className="text-blue-400"> · {t('coaching.queue.draftBadge')}</span>
      ) : null}
    </>
  );

  if (!featured) {
    return (
      <ListRow
        tone={group.severity === 'red' ? 'danger' : group.severity === 'orange' ? 'warning' : 'neutral'}
        leading={(
          <>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${SEVERITY_CLASS[group.severity]}`}>
              {t(`coaching.queue.severity.${group.severity}`)}
            </span>
            {group.avatarUrl ? (
              <img src={group.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
            ) : null}
          </>
        )}
        title={group.clientName}
        subtitle={sinceLabel ? <>{headline} · {sinceLabel}</> : headline}
        onClick={() => onOpen(href)}
        onDismiss={() => onSkip([item.id])}
        dismissLabel={t('coaching.queue.skipFor', { name: group.clientName })}
      />
    );
  }

  return (
    <Card className="!p-4">
      <div className="flex items-start gap-3">
        <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${SEVERITY_CLASS[group.severity]}`}>
          {t(`coaching.queue.severity.${group.severity}`)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {group.avatarUrl ? (
              <img src={group.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
            ) : null}
            <p className="text-sm font-medium text-white truncate">{group.clientName}</p>
          </div>
          <p className="text-sm text-neutral-300">{headline}</p>
          {sinceLabel ? (
            <p className="text-xs text-neutral-500 mt-1">{sinceLabel}</p>
          ) : null}
          {extra > 0 ? (
            <p className="text-xs text-neutral-500 mt-1">{t('coaching.queue.moreSignals', { count: extra })}</p>
          ) : null}
          {lastMessage ? (
            <p className="text-xs text-neutral-500 truncate mt-2">{lastMessage}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Button size="sm" onClick={() => onOpen(href)}>
          {t(action.ctaKey)}
        </Button>
        <Button variant="ghost" size="sm" data-testid="ux34-skip" onClick={() => onSkip([item.id])}>
          {t('coaching.queue.skip')}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onOpen(clientFileHref(group.clientId))}>
          {t('coaching.command.openClient')}
        </Button>
      </div>
    </Card>
  );
}
