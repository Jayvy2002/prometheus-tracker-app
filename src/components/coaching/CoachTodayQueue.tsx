import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck } from 'lucide-react';
import { useCoachingStore } from '../../stores/coachingStore';
import { resolveQueueAction, visibleQueueItems } from '../../lib/coachQueue';
import { todayStr } from '../../lib/utils';
import type { CoachNudgeTemplateKey, CoachPriority, CoachPrioritySeverity } from '../../lib/types';
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
    dismissQueueItem, sendCoachMessage,
  } = useCoachingStore();
  const [composeFor, setComposeFor] = useState<CoachPriority | null>(null);
  const [templateKey, setTemplateKey] = useState<CoachNudgeTemplateKey>('general_followup');
  const [sending, setSending] = useState(false);

  const queue = useMemo(
    () => visibleQueueItems(priorities, queueDismissedIds, clients, todayStr()),
    [priorities, queueDismissedIds, clients],
  );
  const current = queue[0] ?? null;
  const upcoming = queue.slice(1, 3);
  const action = current ? resolveQueueAction(current, pendingInterventions) : null;

  const advance = (item: CoachPriority) => {
    dismissQueueItem(item.id);
    setComposeFor(null);
  };

  const handlePrimary = () => {
    if (!current || !action) return;
    if (action.kind === 'compose' && action.templateKey) {
      setTemplateKey(action.templateKey);
      setComposeFor(current);
      return;
    }
    if (action.href) {
      advance(current);
      navigate(action.href);
    }
  };

  const handleSend = async (body: string) => {
    if (!composeFor || !templateKey) return;
    setSending(true);
    const result = await sendCoachMessage(composeFor.clientId, body, templateKey);
    setSending(false);
    if (result.error) {
      toast(result.error === 'empty' ? t('coaching.queue.emptyBody') : result.error, 'error');
      return;
    }
    toast(t('coaching.queue.sent'));
    advance(composeFor);
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
          <p className="text-xs text-neutral-500">{t('coaching.queue.remaining', { count: queue.length })}</p>
          <button type="button" onClick={() => navigate('/clients')} className="text-xs text-blue-400">
            {t('nav.clients')}
          </button>
        </div>
      </div>

      <Card className="!p-4">
        <div className="flex items-start gap-3">
          <span className="text-lg leading-6 shrink-0" aria-hidden>{SEVERITY_DOT[current.severity]}</span>
          <div className="flex-1 min-w-0">
            {current.avatarUrl ? (
              <div className="flex items-center gap-2 mb-1">
                <img src={current.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                <p className="text-[11px] text-neutral-400 truncate">{current.clientName}</p>
              </div>
            ) : (
              <p className="text-[11px] text-neutral-400 truncate mb-1">{current.clientName}</p>
            )}
            <p className="text-sm font-medium text-white">{t(current.headlineKey, current.headlineParams)}</p>
            <p className="text-xs text-neutral-400 mt-1">{t(current.detailKey, current.detailParams)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Button size="sm" onClick={handlePrimary}>
            {t(action?.ctaKey ?? 'coaching.queue.relance')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => advance(current)}>
            {t('coaching.queue.skip')}
          </Button>
        </div>
        <button
          type="button"
          onClick={() => navigate(current.href)}
          className="mt-3 text-xs text-blue-400 hover:text-blue-300"
        >
          {t('coaching.command.openClient')}
        </button>
      </Card>

      {upcoming.length > 0 && (
        <p className="text-[11px] text-neutral-600 mt-2 px-1">
          {t('coaching.queue.nextUp', { names: upcoming.map(p => p.clientName).join(' · ') })}
        </p>
      )}

      <NudgeComposeModal
        open={!!composeFor}
        clientName={composeFor?.clientName ?? ''}
        templateKey={templateKey}
        sending={sending}
        onClose={() => setComposeFor(null)}
        onSend={handleSend}
      />
    </>
  );
}
