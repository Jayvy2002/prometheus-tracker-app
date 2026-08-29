import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageSquare } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';
import MessageThread from './MessageThread';

export default function ClientMessagesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    myCoach, sentMessages, fetchMyCoach, fetchCoachMessages, sendClientReply, markThreadRead,
  } = useCoachingStore();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchMyCoach();
    fetchCoachMessages();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user && myCoach) void markThreadRead(user.id);
  }, [user, myCoach, sentMessages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async (body: string) => {
    setSending(true);
    const result = await sendClientReply(body);
    setSending(false);
    if (result.error) {
      toast(result.error === 'empty' ? t('coaching.queue.emptyBody') : result.error, 'error');
    }
  };

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28 flex flex-col min-h-[70vh]">
        <h1 className="text-2xl font-bold text-white mb-1">{t('coaching.messages.clientTitle')}</h1>
        <p className="text-sm text-neutral-500 mb-4">
          {myCoach
            ? t('coaching.coachedBy', { name: myCoach.full_name || t('coaching.invite.aCoach') })
            : t('coaching.messages.noCoach')}
        </p>
        {!myCoach ? (
          <Card className="flex items-center gap-3">
            <MessageSquare size={18} className="text-neutral-600" />
            <div>
              <p className="text-sm text-neutral-300">{t('coaching.messages.noCoachBody')}</p>
              <button type="button" onClick={() => navigate('/profile')} className="text-xs text-blue-400 mt-1">
                {t('nav.profile')}
              </button>
            </div>
          </Card>
        ) : (
          <div className="flex-1 min-h-[50vh]">
            <MessageThread
              messages={sentMessages}
              currentUserId={user?.id ?? ''}
              sending={sending}
              onSend={handleSend}
            />
          </div>
        )}
      </div>
    </PageTransition>
  );
}
