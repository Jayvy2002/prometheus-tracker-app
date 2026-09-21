import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { isProspectConversationStatus } from '../../lib/marketplace';
import { readRequests } from '../../lib/marketplaceApi';
import EmptyState from '../ui/EmptyState';
import Button from '../ui/Button';
import PageTransition from '../ui/PageTransition';
import MessageThread from './MessageThread';
import { loadOrCreateMessageKey, clearMessageKey } from '../../lib/idempotencyKeys';
import { firstNameOf } from '../../lib/coachQueue';

export default function ClientMessagesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    myCoach, sentMessages, fetchMyCoach, fetchCoachMessages, sendClientReply, markThreadRead,
    fetchThreadPage, threadExhausted,
  } = useCoachingStore();
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [prospectCoach, setProspectCoach] = useState<{ id: string; full_name: string } | null>(null);
  const peer = myCoach ?? prospectCoach;

  useEffect(() => {
    if (!user) return;
    fetchMyCoach();
    fetchCoachMessages();
    void readRequests(user.id).then(rows => {
      const row = rows.find(item => item.client_id === user.id && item.status === 'coach_accepted')
        ?? rows.find(item => item.client_id === user.id && isProspectConversationStatus(item.status));
      setProspectCoach(row ? { id: row.coach_id, full_name: row.coach_name || '' } : null);
    }).catch(() => setProspectCoach(null));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user && peer) void markThreadRead(user.id);
  }, [user, peer, sentMessages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async (body: string) => {
    if (!user || !peer) return { error: t('coaching.messages.sendFailed') };
    setSending(true);
    try {
      const msgId = loadOrCreateMessageKey(user.id, body, user.id);
      const result = await sendClientReply(body, msgId, peer.id);
      if (!result.error) clearMessageKey(user.id, user.id);
      return result;
    } finally {
      setSending(false);
    }
  };

  const coachName = firstNameOf(peer?.full_name || '') || peer?.full_name || t('coaching.invite.aCoach');

  return (
    <PageTransition>
      <div className="flex flex-col h-[calc(100dvh-6rem)] md:h-[calc(100dvh-2rem)] min-h-0">
        <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-neutral-800 shrink-0">
          <h1 className="text-base font-semibold text-white truncate">
            {peer ? coachName : t('coaching.messages.clientTitle')}
          </h1>
        </div>
        <div className="flex-1 min-h-0 px-4 pt-3">
        {!peer ? (
          <EmptyState
            title={t('coaching.messages.noCoachBody')}
            action={(
              <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/coaches/match')}>
                {t('marketplace.match')}
              </Button>
            )}
          />
        ) : (
          <>
            {!myCoach && <p className="text-sm text-neutral-400 mb-3">{t('coaching.messages.prospectHint')}</p>}
            <MessageThread
            key={`${user?.id}:${peer.id}`}
            accountId={user?.id}
            peerId={peer.id}
            messages={sentMessages.filter(m => m.client_id === user?.id && m.coach_id === peer.id)}
            currentUserId={user?.id ?? ''}
            sending={sending}
            onSend={handleSend}
            hasMore={user ? !threadExhausted[user.id] : false}
            loadingMore={loadingMore}
            onLoadMore={user ? () => {
              if (loadingMore) return;
              setLoadingMore(true);
              void fetchThreadPage(user.id).catch(() => undefined).finally(() => setLoadingMore(false));
            } : undefined}
          />
          </>
        )}
        </div>
      </div>
    </PageTransition>
  );
}
