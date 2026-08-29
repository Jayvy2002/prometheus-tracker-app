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
}: {
  messages: CoachMessage[];
  currentUserId: string;
  sending?: boolean;
  onSend: (body: string) => void;
  emptyHint?: string;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const ordered = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [ordered.length]);

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setBody('');
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-2 pb-3">
        {ordered.length === 0 ? (
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
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 pt-2 border-t border-neutral-800">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={t('coaching.messages.replyPlaceholder')}
          className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white resize-none"
        />
        <Button size="sm" onClick={submit} disabled={!body.trim()} loading={sending} className="self-end">
          {t('common.send')}
        </Button>
      </div>
    </div>
  );
}
