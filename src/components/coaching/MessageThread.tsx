import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mic, Paperclip, Plus, Reply, Square, X } from 'lucide-react';
import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import MessageAttachments from '../messages/MessageAttachments';
import { removeUnsentAttachment, uploadMessageAttachment } from '../../features/messages/api/attachmentsApi';
import {
  MESSAGE_ATTACHMENTS_MAX,
  MESSAGE_ATTACHMENT_ACCEPT,
  formatDuration,
  objectRefOpenHref,
  replyExcerpt,
  type MessageAttachment,
} from '../../features/messages/domain/messageContent';
import { useMessageRefLabels, type MessageRefLabel } from '../../features/messages/hooks/useMessageRefLabels';
import { useVoiceRecorder } from '../../features/messages/hooks/useVoiceRecorder';
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
import { MARKETPLACE_MESSAGE_MAX_LENGTH } from '../../lib/marketplace';

/** What the composer adds to the text (Vision §19). */
export interface ThreadSendExtras {
  attachments: MessageAttachment[];
  replyToId: string | null;
}

type DraftFile = {
  localId: string;
  name: string;
  status: 'uploading' | 'ready' | 'failed';
  attachment?: MessageAttachment;
  problem?: string;
};

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
  thread,
}: {
  messages: CoachMessage[];
  currentUserId: string;
  sending?: boolean;
  /** C02 : résout après confirmation serveur — le brouillon n'est effacé qu'alors. */
  onSend: (body: string, extras: ThreadSendExtras) => Promise<{ error: string | null }>;
  emptyHint?: string;
  draftBody?: string;
  draftHint?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  accountId?: string;
  peerId?: string;
  /** Both parties of the conversation: attachments are stored in their folder. */
  thread?: { coachId: string; clientId: string };
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
    const next = value.slice(0, MARKETPLACE_MESSAGE_MAX_LENGTH);
    revisionRef.current += 1;
    setBody(next);
    saveMessageDraft(accountId, peerId, next);
  };
  const ordered = useMemo(() => [...messages].sort((a, b) =>
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)), [messages]);
  const bilanLabels = useMessageBilanLabels(ordered);
  const refLabels = useMessageRefLabels(ordered, kind => t(`goals.kinds.${kind}`, { defaultValue: t('messages.refs.goal') }));
  const byId = useMemo(() => new Map(ordered.map(m => [m.id, m])), [ordered]);
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [replyTo, setReplyTo] = useState<CoachMessage | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const filesRef = useRef<DraftFile[]>([]);
  filesRef.current = files;
  const readyAttachments = files.flatMap(f => (f.status === 'ready' && f.attachment ? [f.attachment] : []));
  const uploading = files.some(f => f.status === 'uploading');

  const addFile = async (file: File, durationS?: number) => {
    if (!thread) return;
    const localId = crypto.randomUUID();
    const already = filesRef.current.filter(f => f.status !== 'failed').length;
    setFiles(current => [...current, { localId, name: file.name, status: 'uploading' }]);
    const result = await uploadMessageAttachment({
      coachId: thread.coachId,
      clientId: thread.clientId,
      file,
      name: file.name,
      alreadyAttached: already,
      durationS,
    });
    setFiles(current => current.map(f => (f.localId !== localId ? f : result.attachment
      ? { ...f, status: 'ready', attachment: result.attachment }
      : { ...f, status: 'failed', problem: result.error ?? 'upload_failed' })));
  };

  const removeFile = (localId: string) => {
    const target = filesRef.current.find(f => f.localId === localId);
    if (target?.attachment) void removeUnsentAttachment(target.attachment.path);
    setFiles(current => current.filter(f => f.localId !== localId));
  };

  const voice = useVoiceRecorder((file, durationS) => { void addFile(file, durationS); });
  const toolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toolsOpen) return undefined;
    const onDown = (event: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(event.target as Node)) setToolsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setToolsOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [toolsOpen]);

  // Leaving with unsent uploads: remove them rather than leave orphans.
  useEffect(() => () => {
    for (const f of filesRef.current) {
      if (f.attachment) void removeUnsentAttachment(f.attachment.path);
    }
  }, []);

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
    const attachments = readyAttachments;
    if ((!trimmed && attachments.length === 0) || uploading || sending || busyRef.current) return;
    busyRef.current = true;
    const revision = revisionRef.current;
    const extras: ThreadSendExtras = { attachments, replyToId: replyTo?.id ?? null };
    setSendError(null);
    setPendingBody(trimmed || t('messages.attachments.count', { count: attachments.length }));
    try {
      const result = await onSend(trimmed, extras);
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
      // Sent files belong to the thread now: forget them without deleting.
      const sent = new Set(attachments.map(a => a.path));
      setFiles(current => current.filter(f => !f.attachment || !sent.has(f.attachment.path)));
      setReplyTo(null);
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
        {/* An empty thread has nothing older to load. */}
        {onLoadMore && hasMore && ordered.length > 0 ? (
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
              <div className={`flex items-end gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                {mine && <ReplyButton onClick={() => setReplyTo(msg)} />}
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                  mine ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-100 border border-neutral-800'
                }`} data-testid="message-bubble">
                  {msg.reply_to_id ? (
                    <p data-testid="message-reply-quote" className={`mb-1 border-l-2 pl-2 text-xs ${mine ? 'border-blue-200/60 text-blue-100' : 'border-[#525252] text-neutral-400'}`}>
                      {replyExcerpt(byId.get(msg.reply_to_id), { attachment: t('messages.attachments.one'), missing: t('messages.reply.earlier') })}
                    </p>
                  ) : null}
                  {msg.body ? <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.body}</p> : null}
                  <MessageAttachments attachments={msg.attachments ?? []} mine={mine} />
                  {bilanLabels[msg.id] ? (
                    <BilanCard
                      chip={bilanLabels[msg.id]}
                      message={msg}
                      currentUserId={currentUserId}
                      mine={mine}
                    />
                  ) : null}
                  {refLabels[msg.id] ? (
                    <RefCard label={refLabels[msg.id]} message={msg} currentUserId={currentUserId} mine={mine} />
                  ) : null}
                  <p className={`text-xs mt-1 ${mine ? 'text-blue-100' : 'text-neutral-500'}`}>
                    {formatMessageTime(msg.created_at, i18n.language)}
                  </p>
                </div>
                {!mine && <ReplyButton onClick={() => setReplyTo(msg)} />}
              </div>
            </div>
          );
        })}
        {pendingBody ? (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl px-3 py-2 bg-blue-600/50 text-white opacity-70">
              <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{pendingBody}</p>
              <p className="text-[11px] mt-1 text-blue-100">{t('coaching.messages.sending')}</p>
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
        {replyTo ? (
          <div className="mb-2 flex items-start gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2" data-testid="compose-reply">
            <Reply size={14} className="mt-0.5 text-neutral-400" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-xs text-neutral-300">
              <span className="text-neutral-500">{t('messages.reply.to')} </span>
              {replyExcerpt(replyTo, { attachment: t('messages.attachments.one'), missing: t('messages.reply.earlier') })}
            </p>
            <IconButton label={t('messages.reply.cancel')} onClick={() => setReplyTo(null)} className="-my-2 -mr-2">
              <X size={14} />
            </IconButton>
          </div>
        ) : null}
        {files.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-2" aria-label={t('messages.attachments.pending')}>
            {files.map(f => (
              <li key={f.localId} className={`flex max-w-full items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                f.status === 'failed' ? 'border-rose-500/40 text-rose-300' : 'border-neutral-700 text-neutral-200'
              }`}>
                <span className="max-w-[10rem] truncate">{f.name}</span>
                {f.status === 'uploading' && <span className="text-neutral-500">· {t('messages.attachments.uploading')}</span>}
                {f.status === 'failed' && <span role="alert">· {t(`messages.attachments.errors.${f.problem ?? 'upload_failed'}`)}</span>}
                {f.attachment?.duration_s != null && <span className="text-neutral-500">· {formatDuration(f.attachment.duration_s)}</span>}
                <button type="button" className="min-h-8 min-w-8 -mr-2 inline-flex items-center justify-center" aria-label={t('messages.attachments.remove', { name: f.name })} onClick={() => removeFile(f.localId)}>
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {voice.state === 'recording' ? (
          <p className="mb-2 text-xs text-rose-300" role="status">{t('messages.voice.recording', { duration: formatDuration(voice.seconds) })}</p>
        ) : null}
        {voice.state === 'denied' ? (
          <p className="mb-2 text-xs text-amber-300" role="status">{t('messages.voice.denied')}</p>
        ) : null}
        <div className="flex gap-2">
          {thread ? (
            <div ref={toolsRef} className="relative flex flex-col justify-end">
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={MESSAGE_ATTACHMENT_ACCEPT}
                className="hidden"
                data-testid="message-file-input"
                onChange={event => {
                  const picked = Array.from(event.target.files ?? []);
                  event.target.value = '';
                  for (const file of picked) void addFile(file);
                }}
              />
              {voice.state === 'recording' ? (
                <IconButton
                  label={t('messages.voice.stop', { duration: formatDuration(voice.seconds) })}
                  onClick={() => voice.stop()}
                  className="text-rose-400"
                >
                  <Square size={16} />
                </IconButton>
              ) : (
                <IconButton
                  label={t('messages.compose.more')}
                  aria-expanded={toolsOpen}
                  aria-haspopup="menu"
                  onClick={() => setToolsOpen(open => !open)}
                >
                  <Plus size={18} />
                </IconButton>
              )}
              {toolsOpen && voice.state !== 'recording' ? (
                <div role="menu" className="absolute bottom-full left-0 z-20 mb-1 min-w-[12rem] rounded-xl border border-neutral-800 bg-neutral-950 p-1 shadow-xl">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
                    disabled={readyAttachments.length + files.filter(f => f.status === 'uploading').length >= MESSAGE_ATTACHMENTS_MAX}
                    onClick={() => { setToolsOpen(false); fileInput.current?.click(); }}
                  >
                    <Paperclip size={16} aria-hidden="true" /> {t('messages.attachments.add')}
                  </button>
                  {voice.state !== 'unsupported' ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm text-white hover:bg-neutral-800"
                      onClick={() => { setToolsOpen(false); void voice.start(); }}
                    >
                      <Mic size={16} aria-hidden="true" /> {t('messages.voice.record')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
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
            maxLength={MARKETPLACE_MESSAGE_MAX_LENGTH}
            placeholder={t('coaching.messages.replyPlaceholder')}
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white resize-none"
          />
          <Button type="button" size="sm" onClick={() => void submit()} disabled={(!body.trim() && readyAttachments.length === 0) || uploading} loading={sending || pendingBody !== null} className="self-end">
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
      <p className={`text-[11px] mt-0.5 ${mine ? 'text-blue-100/80' : 'text-neutral-500'}`}>
        {openLabel}
      </p>
    </Link>
  );
}

function ReplyButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <IconButton label={t('messages.reply.action')} onClick={onClick} className="shrink-0 text-neutral-500 hover:text-neutral-200">
      <Reply size={14} />
    </IconButton>
  );
}

function RefCard({
  label,
  message,
  currentUserId,
  mine,
}: {
  label: MessageRefLabel;
  message: CoachMessage;
  currentUserId: string;
  mine: boolean;
}) {
  const { t } = useTranslation();
  const kindLabel = t(`messages.refs.${label.ref.kind}`);
  const text = label.name ? `${kindLabel} · ${label.name}` : kindLabel;
  const href = objectRefOpenHref(label.ref, bilanViewerFor(currentUserId, message), message.client_id);
  const tone = mine ? 'bg-white/10 hover:bg-white/15 text-blue-50' : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200';
  // No longer readable (relationship ended, object deleted): a neutral label, no link.
  if (!href || (label.ref.kind !== 'exercise' && !label.name)) {
    return <p data-testid="message-ref" className={`mt-2 rounded-xl px-2.5 py-2 text-[11px] ${tone}`}>{text}</p>;
  }
  return (
    <Link to={href} data-testid="message-ref" data-ref-kind={label.ref.kind} className={`mt-2 block rounded-xl px-2.5 py-2 ${tone}`}>
      <p className="text-[11px] font-medium">{text}</p>
      <p className="text-[11px] opacity-80">{t('messages.refs.open')}</p>
    </Link>
  );
}
