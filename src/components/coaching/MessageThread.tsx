import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import type { CoachMessage } from '../../lib/types';

export default function MessageThread({
  messages,
  currentUserId,
  sending,
  onSend,
  emptyHint,
  draftBody,
  draftHint,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  messages: CoachMessage[];
  currentUserId: string;
  sending?: boolean;
  /** C02 : résout après confirmation serveur — le brouillon n'est effacé qu'alors. */
  onSend: (body: string) => Promise<{ error: string | null }>;
  emptyHint?: string;
  draftBody?: string;
  draftHint?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingBody, setPendingBody] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const ordered = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));

  useEffect(() => {
    if (typeof draftBody === 'string' && draftBody.length > 0) setBody(draftBody);
  }, [draftBody]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [ordered.length, pendingBody]);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSendError(null);
    setPendingBody(trimmed);
    const result = await onSend(trimmed);
    setPendingBody(null);
    if (result.error) {
      // C02 : le texte est conservé pour réessayer — jamais perdu sur échec.
      setSendError(result.error);
      return;
    }
    setBody('');
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-2 pb-3">
        {onLoadMore && hasMore ? (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="w-full text-center text-xs text-blue-400 py-2 disabled:opacity-50"
          >
            {loadingMore ? t('common.loading') : t('coaching.messages.loadMore')}
          </button>
        ) : null}
        {ordered.length === 0 && !pendingBody ? (
          <p className="text-sm text-neutral-500 px-1">{emptyHint || t('coaching.messages.threadEmpty')}</p>
        ) : ordered.map(msg => {
          const mine = msg.sender_id === currentUserId;
          return (
            <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                mine ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-100 border border-neutral-800'
              }`}>
                <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                <p className={`text-[10px] mt-1 ${mine ? 'text-blue-100/70' : 'text-neutral-500'}`}>
                  {new Date(msg.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
        {pendingBody ? (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl px-3 py-2 bg-blue-600/50 text-white opacity-70">
              <p className="text-sm whitespace-pre-wrap">{pendingBody}</p>
              <p className="text-[10px] mt-1 text-blue-100/70">{t('coaching.messages.sending')}</p>
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <div className="pt-2 border-t border-neutral-800">
        {draftHint ? (
          <p className="text-[11px] text-neutral-500 mb-2">{draftHint}</p>
        ) : null}
        {sendError ? (
          <p className="text-xs text-red-400 mb-2" role="alert">{sendError}</p>
        ) : null}
        <div className="flex gap-2">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={draftBody ? 4 : 2}
            placeholder={t('coaching.messages.replyPlaceholder')}
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white resize-none"
          />
          <Button size="sm" onClick={() => void submit()} disabled={!body.trim()} loading={sending} className="self-end">
            {t('common.send')}
          </Button>
        </div>
      </div>
    </div>
  );
}
