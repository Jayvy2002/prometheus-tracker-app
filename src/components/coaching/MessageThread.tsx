import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import type { CoachMessage } from '../../lib/types';
import { formatMessageDay, formatMessageTime, messageDayKey } from '../../lib/messageDates';
import {
  clearMessageDraft,
  composeThreadBody,
  loadMessageDraft,
  saveMessageDraft,
} from '../../lib/messageDrafts';
import { bilanOpenHref, bilanViewerFor, formatBilanDate } from '../../lib/messageBilan';
import { useMessageBilanLabels, type MessageBilanChip } from '../../features/coaching/hooks/useMessageBilanLabels';

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
  accountId,
  peerId,
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
  accountId?: string;
  peerId?: string;
}) {
  const { t, i18n } = useTranslation();
  const [body, setBody] = useState(() => composeThreadBody(loadMessageDraft(accountId, peerId), draftBody));
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingBody, setPendingBody] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const revisionRef = useRef(0);
  const nearBottom = useRef(true);
  const previous = useRef({ first: '', last: '', height: 0 });
  const [newMessages, setNewMessages] = useState(false);
  const changeBody = (value: string) => {
    revisionRef.current += 1;
    setBody(value);
    saveMessageDraft(accountId, peerId, value);
  };
  const ordered = useMemo(() => [...messages].sort((a, b) =>
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)), [messages]);
  const bilanLabels = useMessageBilanLabels(ordered);

  useEffect(() => {
    const personal = loadMessageDraft(accountId, peerId);
    if (personal.trim()) {
      setBody(personal);
      return;
    }
    if (typeof draftBody === 'string' && draftBody.length > 0) {
      setBody(current => (current.trim() ? current : draftBody));
      return;
    }
    setBody('');
  }, [accountId, peerId, draftBody]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const first = ordered[0]?.id ?? '';
    const last = ordered[ordered.length - 1]?.id ?? '';
    const prev = previous.current;
    if (prev.first && first !== prev.first && last === prev.last) {
      el.scrollTop += el.scrollHeight - prev.height;
    } else if (!prev.last || nearBottom.current) {
      el.scrollTop = el.scrollHeight;
    } else if (last !== prev.last) {
      setNewMessages(true);
    }
    previous.current = { first, last, height: el.scrollHeight };
  }, [ordered, pendingBody]);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed || sending || busyRef.current) return;
    busyRef.current = true;
    const revision = revisionRef.current;
    setSendError(null);
    setPendingBody(trimmed);
    try {
      const result = await onSend(trimmed);
      if (result.error) {
        // C02 : le texte est conservé pour réessayer — jamais perdu sur échec.
        setSendError(t('coaching.messages.sendFailed'));
        return;
      }
      // An acknowledgement must never erase a newer edit, even identical text.
      if (revisionRef.current === revision) {
        setBody('');
        clearMessageDraft(accountId, peerId);
      }
    } catch {
      setSendError(t('coaching.messages.sendFailed'));
    } finally {
      busyRef.current = false;
      setPendingBody(null);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={scrollRef} role="region" aria-label={t('nav.messages')} tabIndex={0}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
          if (nearBottom.current) setNewMessages(false);
        }}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2 pb-3">
        {onLoadMore && hasMore ? (
          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? t('common.loading') : t('coaching.messages.loadMore')}
          </Button>
        ) : null}
        {ordered.length === 0 && !pendingBody ? (
          <p className="text-sm text-neutral-500 px-1">{emptyHint || t('coaching.messages.threadEmpty')}</p>
        ) : ordered.map((msg, i) => {
          const mine = msg.sender_id === currentUserId;
          const day = messageDayKey(msg.created_at);
          const prevDay = i > 0 ? messageDayKey(ordered[i - 1].created_at) : null;
          return (
            <div key={msg.id}>
              {day !== prevDay && (
                <p className="text-center text-xs text-neutral-500 py-2">
                  {formatMessageDay(msg.created_at, i18n.language, t('common.today'), t('common.yesterday'))}
                </p>
              )}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                  mine ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-100 border border-neutral-800'
                }`}>
                  <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.body}</p>
                  {bilanLabels[msg.id] ? (
                    <BilanCard
                      chip={bilanLabels[msg.id]}
                      message={msg}
                      currentUserId={currentUserId}
                      mine={mine}
                    />
                  ) : null}
                  <p className={`text-xs mt-1 ${mine ? 'text-blue-100' : 'text-neutral-500'}`}>
                    {formatMessageTime(msg.created_at, i18n.language)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {pendingBody ? (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl px-3 py-2 bg-blue-600/50 text-white opacity-70">
              <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{pendingBody}</p>
              <p className="text-[10px] mt-1 text-blue-100">{t('coaching.messages.sending')}</p>
            </div>
          </div>
        ) : null}
        
      </div>
      {newMessages && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
            nearBottom.current = true;
            setNewMessages(false);
          }}
        >
          {t('coaching.messages.newMessages')}
        </Button>
      )}
      <div className="pt-2 pb-2 border-t border-neutral-800 shrink-0">
        {draftHint ? (
          <p data-testid="ux27-compose-hint" className="text-sm text-neutral-500 mb-2">{draftHint}</p>
        ) : null}
        {sendError ? (
          <div className="mb-2 flex items-center gap-2" role="alert">
            <p className="text-sm text-rose-400 flex-1">{sendError}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => void submit()}>
              {t('errors.retry')}
            </Button>
          </div>
        ) : null}
        <div className="flex gap-2">
          <textarea
            value={body}
            aria-label={t('coaching.messages.replyPlaceholder')}
            onChange={e => changeBody(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229 && window.matchMedia('(pointer: fine)').matches) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={draftBody ? 4 : 2}
            placeholder={t('coaching.messages.replyPlaceholder')}
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white resize-none"
          />
          <Button type="button" size="sm" onClick={() => void submit()} disabled={!body.trim()} loading={sending || pendingBody !== null} className="self-end">
            {t('common.send')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BilanCard({
  chip,
  message,
  currentUserId,
  mine,
}: {
  chip: MessageBilanChip;
  message: CoachMessage;
  currentUserId: string;
  mine: boolean;
}) {
  const { t, i18n } = useTranslation();
  const label = chip.kind === 'workout'
    ? t('coaching.messages.aboutWorkout', {
      name: chip.name || t('workout.unnamed'),
      date: formatBilanDate(chip.date, i18n.language),
    })
    : t('coaching.messages.aboutCheckin', {
      date: formatBilanDate(chip.date, i18n.language),
    });
  const href = bilanOpenHref({
    viewer: bilanViewerFor(currentUserId, message),
    clientId: message.client_id,
    workoutId: message.workout_id,
    checkinId: message.checkin_id,
  });
  const openLabel = chip.kind === 'workout'
    ? t('coaching.messages.openWorkoutRecap')
    : t('coaching.messages.openCheckinFiche');
  const chipClass = `text-[11px] ${mine ? 'text-blue-100' : 'text-neutral-300'}`;
  if (!href) {
    return <p data-testid="ux27-bilan-chip" className={`mt-1 ${chipClass}`}>{label}</p>;
  }
  return (
    <Link
      to={href}
      data-testid="ux32-bilan-card"
      data-bilan-kind={chip.kind}
      aria-label={`${label}. ${openLabel}`}
      className={`mt-2 block rounded-xl px-2.5 py-2 ${
        mine ? 'bg-white/10 hover:bg-white/15' : 'bg-neutral-800 hover:bg-neutral-700'
      }`}
    >
      <p data-testid="ux27-bilan-chip" className={`font-medium ${chipClass}`}>{label}</p>
      <p className={`text-[10px] mt-0.5 ${mine ? 'text-blue-100/80' : 'text-neutral-500'}`}>
        {openLabel}
      </p>
    </Link>
  );
}
