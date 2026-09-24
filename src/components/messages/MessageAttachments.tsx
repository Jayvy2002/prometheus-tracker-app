import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Mic } from 'lucide-react';
import { attachmentUrl } from '../../features/messages/api/attachmentsApi';
import { formatDuration, formatSize, type MessageAttachment } from '../../features/messages/domain/messageContent';
import { formatNumber } from '../../lib/utils';

/** Files of one message. Links are short-lived and private to the thread. */
export default function MessageAttachments({ attachments, mine }: { attachments: MessageAttachment[]; mine: boolean }) {
  if (!attachments.length) return null;
  return (
    <ul className="mt-1.5 space-y-1.5" data-testid="message-attachments">
      {attachments.map(item => (
        <li key={item.path}>
          <AttachmentView item={item} mine={mine} />
        </li>
      ))}
    </ul>
  );
}

function AttachmentView({ item, mine }: { item: MessageAttachment; mine: boolean }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void attachmentUrl(item.path).then(next => {
      if (!live) return;
      if (next) setUrl(next);
      else setFailed(true);
    });
    return () => { live = false; };
  }, [item.path]);

  const muted = mine ? 'text-blue-100' : 'text-neutral-400';
  const size = formatSize(item.size, { kb: t('messages.attachments.kb'), mb: t('messages.attachments.mb') }, n => formatNumber(n));

  if (failed) {
    return <p className={`text-xs ${muted}`}>{t('messages.attachments.unavailable', { name: item.name })}</p>;
  }
  if (!url) {
    return <div className={`h-10 rounded-xl ${mine ? 'bg-white/10' : 'bg-neutral-800'} animate-pulse`} aria-label={t('common.loading')} />;
  }
  if (item.kind === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block" aria-label={t('messages.attachments.openImage', { name: item.name })}>
        <img src={url} alt={item.name} loading="lazy" className="max-h-56 w-auto max-w-full rounded-xl object-cover" />
      </a>
    );
  }
  if (item.kind === 'video') {
    return (
      <video src={url} controls preload="metadata" playsInline className="max-h-64 w-full rounded-xl bg-black" aria-label={item.name}>
        <a href={url}>{item.name}</a>
      </video>
    );
  }
  if (item.kind === 'audio') {
    return (
      <div className="flex items-center gap-2">
        <Mic size={14} className={muted} aria-hidden="true" />
        <audio src={url} controls preload="metadata" className="h-9 max-w-full" aria-label={t('messages.attachments.voiceNote', { duration: formatDuration(item.duration_s) })} />
        {item.duration_s != null && <span className={`text-xs ${muted}`}>{formatDuration(item.duration_s)}</span>}
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download={item.name}
      className={`flex min-h-11 items-center gap-2 rounded-xl px-2.5 py-2 ${mine ? 'bg-white/10 hover:bg-white/15' : 'bg-neutral-800 hover:bg-neutral-700'}`}
    >
      <FileText size={16} className={muted} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
      <span className={`text-xs ${muted}`}>{size}</span>
    </a>
  );
}
