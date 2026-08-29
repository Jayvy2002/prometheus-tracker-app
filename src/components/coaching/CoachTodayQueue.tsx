import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck } from 'lucide-react';
import { useCoachingStore } from '../../stores/coachingStore';
import {
  composeItemsInGroup,
  groupQueueByClient,
  matchingPendingIntervention,
  nextClientNames,
  queueItemLabelKey,
  resolveQueueAction,
  visibleQueueItems,
} from '../../lib/coachQueue';
import { todayStr } from '../../lib/utils';
import type { CoachNudgeTemplateKey, CoachPriority, CoachPrioritySeverity, CoachQueueClientGroup } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { toast } from '../ui/Toast';
import NudgeComposeModal from './NudgeComposeModal';

const SEVERITY_DOT: Record<CoachPrioritySeverity, string> = {
  red: '🔴',
  orange: '🟠',
  yellow: '🟡',
};

export default function CoachTodayQueue() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    priorities, pendingInterventions, clients, queueDismissedIds,
    dismissQueueItems, sendCoachMessage, coachSettings,
  } = useCoachingStore();
  const [composeFor, setComposeFor] = useState<CoachQueueClientGroup | null>(null);
  const [templateKey, setTemplateKey] = useState<CoachNudgeTemplateKey>('general_followup');
  const [sending, setSending] = useState(false);

  const groups = useMemo(
    () => groupQueueByClient(visibleQueueItems(priorities, queueDismissedIds, clients, todayStr())),
    [priorities, queueDismissedIds, clients],
  );
  const current = groups[0] ?? null;
  const upcomingNames = nextClientNames(groups);
  const composeItems = current ? composeItemsInGroup(current.items) : [];
  const composeAction = composeItems[0] ? resolveQueueAction(composeItems[0], pendingInterventions) : null;
  const setupAction = current
    ? current.items.map(item => resolveQueueAction(item, pendingInterventions)).find(a => a.kind === 'open_setup' || a.kind === 'open_draft')
    : null;

  const skipClient = (group: CoachQueueClientGroup) => {
    dismissQueueItems(group.items.map(item => item.id));
    setComposeFor(null);
  };

  const handleRelance = () => {
    if (!current || !composeAction?.templateKey) return;
    setTemplateKey(composeAction.templateKey);
    setComposeFor(current);
  };

  const handleSend = async (body: string, opts?: { templateKey?: CoachNudgeTemplateKey }) => {
    if (!composeFor) return;
    const key = opts?.templateKey ?? templateKey;
    setSending(true);
    const result = await sendCoachMessage(composeFor.clientId, body, key);
    setSending(false);
    if (result.error) {
      toast(result.error === 'empty' ? t('coaching.queue.emptyBody') : result.error, 'error');
      return;
    }
    toast(t('coaching.queue.sent'));
    dismissQueueItems(composeItemsInGroup(composeFor.items).map(item => item.id));
    setComposeFor(null);
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
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          {composeAction?.kind === 'compose' && (
            <Button size="sm" onClick={handleRelance}>
              {t('coaching.queue.relance')}
            </Button>
          )}
          {!composeAction && setupAction?.href && (
            <Button size="sm" onClick={() => navigate(setupAction.href!)}>
              {t(setupAction.ctaKey)}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => navigate(`/clients/${current.clientId}`)}>
            {t('coaching.command.openClient')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => skipClient(current)}>
            {t('coaching.queue.skip')}
          </Button>
        </div>
      </Card>

      {upcomingNames.length > 0 && (
        <p className="text-[11px] text-neutral-600 mt-2 px-1">
          {t('coaching.queue.nextUp', { names: upcomingNames.join(' · ') })}
        </p>
      )}

      <NudgeComposeModal
        open={!!composeFor}
        clientName={composeFor?.clientName ?? ''}
        templateKey={templateKey}
        sending={sending}
        templates={coachSettings?.nudge_templates}
        onClose={() => setComposeFor(null)}
        onSend={handleSend}
      />
    </>
  );
}
