import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import {
  firstNameOf,
  groupMessageThreads,
  parseNudgeQuery,
  relanceThreadHref,
} from '../../lib/coachQueue';
import { resolveNudgeBody } from '../../lib/coachSettings';
import { displayName } from '../../lib/coachText';
import { clientFileHref } from '../../lib/coachSituation';
import { coachingPassHref } from '../../lib/coachInterventions';
import { isRelanceKind, parsePreparedMessage, preparedTemplateKey } from '../../lib/coachFleet';
import { loadOrCreateMessageKey, clearMessageKey } from '../../lib/idempotencyKeys';
import EmptyState from '../ui/EmptyState';
import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import ListRow from '../ui/ListRow';
import PageHeader from '../ui/PageHeader';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';
import MessageThread from './MessageThread';
import InterventionInboxCard from './InterventionInboxCard';

export default function CoachInboxPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { clientId } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const {
    fetchCoachOps, fetchCoachMessages, fetchCoachSettings, pendingInterventions, clients, sentMessages,
    sendCoachMessage, markThreadRead, coachSettings,
    applyIntervention,
    fetchThreadPage, threadExhausted,
  } = useCoachingStore();
  const [sending, setSending] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const nudgeKey = parseNudgeQuery(searchParams.get('nudge'));

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
  const clientName = activeClient ? displayName(activeClient, t('coaching.unnamed')) : t('coaching.unnamed');
  const draftName = firstNameOf(clientName) || clientName;
  const draftBody = nudgeKey
    ? resolveNudgeBody(
      nudgeKey,
      draftName,
      i18n.language,
      coachSettings?.nudge_templates,
      t(`coaching.queue.templates.${nudgeKey}`, { name: draftName }),
    )
    : undefined;

  const handleSend = async (body: string) => {
    if (!clientId || !user) return { error: t('coaching.messages.sendFailed') };
    setSending(true);
    try {
      const msgId = loadOrCreateMessageKey(clientId, body, user.id);
      const result = await sendCoachMessage(clientId, body, nudgeKey ?? 'general_followup', msgId);
      if (!result.error) clearMessageKey(clientId, user.id);
      return result;
    } finally {
      setSending(false);
    }
  };

  const handleSendCard = async (item: typeof pendingInterventions[number]) => {
    if (!item.client_id) {
      navigate(coachingPassHref(item, { from: 'messages' }));
      return;
    }
    setSendingId(item.id);
    if (isRelanceKind(item.kind)) {
      const body = parsePreparedMessage(item.payload);
      const resolved = await applyIntervention(item.id, 'sent', item.payload, {
        assign_client_id: item.client_id,
        message: {
          body,
          template_key: preparedTemplateKey(item.payload, item.kind),
        },
      });
      setSendingId(null);
      if (resolved.error) {
        toast(t(resolved.error === 'already_claimed' ? 'errors.alreadyClaimed' : resolved.error === 'already_resolved' ? 'errors.alreadyResolved' : 'errors.saveFailed'), 'error');
        return;
      }
      toast(t('coaching.queue.sent'));
      return;
    }
    if (item.kind === 'calorie_adjustment') {
      setSendingId(null);
      navigate(coachingPassHref(item, { from: 'messages' }));
      return;
    }
    setSendingId(null);
    navigate(coachingPassHref(item, { from: 'messages' }));
  };

  if (clientId) {
    return (
      <PageTransition>
        <div className="px-4 pt-3 pb-0 md:px-6 flex flex-col h-[calc(100dvh-6rem)] md:h-[calc(100dvh-2rem)] min-h-0">
          <div className="flex items-center gap-3 pb-2 border-b border-neutral-800 shrink-0">
            <IconButton label={t('nav.messages')} onClick={() => navigate('/messages')} className="-ml-2">
              <ArrowLeft size={18} />
            </IconButton>
            <h1 className="text-base font-semibold text-white truncate flex-1">{clientName}</h1>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate(clientFileHref(clientId))}
            >
              {t('coaching.command.openClient')}
            </Button>
          </div>
          <div className="flex-1 min-h-0">
            <MessageThread
              key={`${user?.id}:${clientId}`}
              accountId={user?.id}
              peerId={clientId}
              messages={threadMessages}
              currentUserId={user?.id ?? ''}
              sending={sending}
              draftBody={draftBody}
              draftHint={nudgeKey ? t('coaching.queue.relanceDraftHint') : undefined}
              onSend={handleSend}
              hasMore={clientId ? !threadExhausted[clientId] : false}
              loadingMore={loadingMore}
              onLoadMore={clientId ? () => {
                if (loadingMore) return;
                setLoadingMore(true);
                void fetchThreadPage(clientId).catch(() => undefined).finally(() => setLoadingMore(false));
              } : undefined}
            />
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
        <div className="px-4 pt-6 pb-6 md:px-6">
        <PageHeader title={t('coaching.inbox.title')} subtitle={t('coaching.inbox.subtitle')} />

        {pendingInterventions.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">
              {t('coaching.inbox.toHandle')}
            </p>
            <div className="space-y-2">
              {pendingInterventions.map(item => {
                const client = clients.find(c => c.id === item.client_id);
                return (
                  <InterventionInboxCard
                    key={item.id}
                    item={item}
                    clientName={client?.full_name || client?.email || t('coaching.interventions.appWide')}
                    sending={sendingId === item.id}
                    onSend={handleSendCard}
                  />
                );
              })}
            </div>
          </div>
        )}

        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">
          {t('coaching.inbox.threads')}
        </p>
        {threads.length === 0 ? (
          <EmptyState title={t('coaching.inbox.threadsEmpty')} />
        ) : (
          <div className="space-y-2">
            {threads.map(thread => {
              const client = clients.find(c => c.id === thread.clientId);
              return (
                <ListRow
                  key={thread.clientId}
                  to={`/messages/${thread.clientId}`}
                  leading={(
                    <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-300 flex items-center justify-center font-semibold text-sm shrink-0">
                      {(client?.full_name?.[0] || client?.email?.[0] || '?').toUpperCase()}
                    </div>
                  )}
                  title={client ? displayName(client, t('coaching.unnamed')) : t('coaching.unnamed')}
                  subtitle={thread.lastMessage?.body || t('coaching.messages.noMessagesYet')}
                  badge={thread.unreadCount > 0 ? thread.unreadCount : undefined}
                  trailing={(
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(relanceThreadHref(thread.clientId, 'general_followup'));
                      }}
                    >
                      {t('coaching.queue.relance')}
                    </Button>
                  )}
                />
              );
            })}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
