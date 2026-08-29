import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight, MessageSquare, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { groupMessageThreads } from '../../lib/coachQueue';
import { displayName } from '../../lib/coachText';
import { interventionHref, isCoachOnlyKind, payloadSummary } from '../../lib/coachInterventions';
import { interventionLiveLabel } from '../../lib/coachSecond';
import type { CoachNudgeTemplateKey } from '../../lib/types';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';
import MessageThread from './MessageThread';
import NudgeComposeModal from './NudgeComposeModal';

export default function CoachInboxPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clientId } = useParams();
  const { user } = useAuthStore();
  const {
    fetchCoachOps, fetchCoachMessages, fetchCoachSettings, pendingInterventions, clients, sentMessages,
    sendCoachMessage, markThreadRead, coachSettings,
  } = useCoachingStore();
  const [composeFor, setComposeFor] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchCoachOps();
    fetchCoachMessages();
    fetchCoachSettings();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (clientId) void markThreadRead(clientId);
  }, [clientId, sentMessages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const threads = useMemo(
    () => (user ? groupMessageThreads(sentMessages, clients, user.id) : []),
    [sentMessages, clients, user],
  );
  const activeClient = clients.find(c => c.id === clientId);
  const threadMessages = sentMessages.filter(m => m.client_id === clientId);

  const handleSend = async (body: string, opts?: { templateKey?: CoachNudgeTemplateKey }) => {
    const target = clientId || composeFor;
    if (!target) return;
    setSending(true);
    const result = await sendCoachMessage(target, body, opts?.templateKey ?? 'general_followup');
    setSending(false);
    if (result.error) {
      toast(result.error === 'empty' ? t('coaching.queue.emptyBody') : result.error, 'error');
      return;
    }
    toast(t('coaching.queue.sent'));
    setComposeFor(null);
  };

  if (clientId) {
    return (
      <PageTransition>
        <div className="px-4 pt-6 pb-28 md:px-6 flex flex-col min-h-[70vh]">
          <button onClick={() => navigate('/messages')} className="flex items-center gap-2 text-neutral-400 hover:text-white mb-3">
            <ArrowLeft size={18} /> {t('nav.messages')}
          </button>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h1 className="text-lg font-semibold text-white truncate">
              {activeClient ? displayName(activeClient, t('coaching.unnamed')) : t('coaching.unnamed')}
            </h1>
            <button
              type="button"
              onClick={() => navigate(`/clients/${clientId}`)}
              className="text-xs text-blue-400 shrink-0"
            >
              {t('coaching.command.openClient')}
            </button>
          </div>
          <div className="flex-1 min-h-[50vh]">
            <MessageThread
              messages={threadMessages}
              currentUserId={user?.id ?? ''}
              sending={sending}
              onSend={body => handleSend(body, { templateKey: 'general_followup' })}
            />
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28 md:px-6">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">{t('coaching.inbox.title')}</h1>
            <p className="text-sm text-neutral-500">{t('coaching.inbox.subtitle')}</p>
          </div>
        </div>

        {pendingInterventions.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">
              {t('coaching.inbox.toHandle')}
            </p>
            <div className="space-y-2">
              {pendingInterventions.map(item => {
                const client = clients.find(c => c.id === item.client_id);
                return (
                  <Card key={item.id} onClick={() => navigate(interventionHref(item))} className="flex items-start gap-3">
                    <Sparkles size={16} className={`mt-1 ${isCoachOnlyKind(item.kind) ? 'text-violet-400' : 'text-blue-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {item.title || t(`coaching.interventions.kinds.${item.kind}`)}
                      </p>
                      <p className="text-[11px] text-neutral-500 truncate">
                        {client?.full_name || client?.email || t('coaching.interventions.appWide')}
                        {' · '}
                        {interventionLiveLabel(item, t) || payloadSummary(item)}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-neutral-600 mt-1" />
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">
          {t('coaching.inbox.threads')}
        </p>
        {threads.length === 0 ? (
          <Card className="flex items-center gap-3">
            <MessageSquare size={18} className="text-neutral-600" />
            <p className="text-sm text-neutral-400">{t('coaching.inbox.threadsEmpty')}</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {threads.map(thread => {
              const client = clients.find(c => c.id === thread.clientId);
              return (
                <Card
                  key={thread.clientId}
                  onClick={() => navigate(`/messages/${thread.clientId}`)}
                  className="flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-300 flex items-center justify-center font-semibold text-sm shrink-0">
                    {(client?.full_name?.[0] || client?.email?.[0] || '?').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white truncate">
                        {client ? displayName(client, t('coaching.unnamed')) : t('coaching.unnamed')}
                      </p>
                      {thread.unreadCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-600 text-white">
                          {thread.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                      {thread.lastMessage?.body || t('coaching.messages.noMessagesYet')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setComposeFor(thread.clientId);
                    }}
                    className="text-[11px] text-blue-400 shrink-0 mt-1"
                  >
                    {t('coaching.queue.relance')}
                  </button>
                </Card>
              );
            })}
          </div>
        )}

        <NudgeComposeModal
          open={!!composeFor}
          clientName={clients.find(c => c.id === composeFor)?.full_name || clients.find(c => c.id === composeFor)?.email || ''}
          templateKey="general_followup"
          sending={sending}
          showTemplatePicker
          templates={coachSettings?.nudge_templates}
          onClose={() => setComposeFor(null)}
          onSend={(body, opts) => handleSend(body, { templateKey: opts?.templateKey })}
        />
      </div>
    </PageTransition>
  );
}
