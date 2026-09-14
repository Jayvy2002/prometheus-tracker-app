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
  visibleQueueItems,
} from '../../lib/coachQueue';
import { todayStr } from '../../lib/utils';
import { clientFileHref } from '../../lib/coachSituation';
import type { CoachPrioritySeverity, CoachQueueClientGroup } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';

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
            onOpen={href => navigate(href)}
            onSkip={() => dismissQueueItems(group.items.map(item => item.id))}
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
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const pending = useCoachingStore(s => s.pendingInterventions);
  const { item, action } = primaryQueueAction(group, pending);
  const href = queueActionHref(item, action);
  const draft = matchingPendingIntervention(item, pending);
  const extra = group.items.length - 1;
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
      <button
        type="button"
        onClick={() => onOpen(href)}
        className="w-full flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 px-3.5 py-3 text-left hover:border-neutral-700"
      >
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${SEVERITY_CLASS[group.severity]}`}>
          {t(`coaching.queue.severity.${group.severity}`)}
        </span>
        {group.avatarUrl ? (
          <img src={group.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">{group.clientName}</p>
          <p className="text-xs text-neutral-400 truncate">{headline}</p>
        </div>
      </button>
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
          {extra > 0 ? (
            <p className="text-[11px] text-neutral-500 mt-1">{t('coaching.queue.moreSignals', { count: extra })}</p>
          ) : null}
          {lastMessage ? (
            <p className="text-[11px] text-neutral-500 truncate mt-2">{lastMessage}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Button size="sm" onClick={() => onOpen(href)}>
          {t(action.ctaKey)}
        </Button>
        <Button variant="ghost" size="sm" onClick={onSkip}>
          {t('coaching.queue.skip')}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onOpen(clientFileHref(group.clientId))}>
          {t('coaching.command.openClient')}
        </Button>
      </div>
    </Card>
  );
}
