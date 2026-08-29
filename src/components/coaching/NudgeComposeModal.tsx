import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { firstNameOf } from '../../lib/coachQueue';
import type { CoachNudgeTemplateKey } from '../../lib/types';

interface NudgeComposeModalProps {
  open: boolean;
  clientName: string;
  templateKey: CoachNudgeTemplateKey;
  sending?: boolean;
  onClose: () => void;
  onSend: (body: string) => void;
}

export default function NudgeComposeModal({
  open,
  clientName,
  templateKey,
  sending,
  onClose,
  onSend,
}: NudgeComposeModalProps) {
  const { t } = useTranslation();
  const name = firstNameOf(clientName) || clientName;
  const template = t(`coaching.queue.templates.${templateKey}`, { name });
  const [body, setBody] = useState(template);

  useEffect(() => {
    if (!open) return;
    setBody(t(`coaching.queue.templates.${templateKey}`, { name }));
  }, [open, templateKey, name, t]);

  const canSend = body.trim().length > 0 && !sending;

  return (
    <Modal open={open} onClose={onClose} title={t('coaching.queue.composeTitle', { name })}>
      <p className="text-xs text-neutral-500 mb-3">{t('coaching.queue.composeHint')}</p>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={7}
        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white
          placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
          transition-all duration-200 resize-y min-h-[140px]"
      />
      <div className="flex items-center justify-end gap-2 mt-4">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={sending}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" onClick={() => onSend(body)} disabled={!canSend} loading={sending}>
          {t('coaching.queue.send')}
        </Button>
      </div>
    </Modal>
  );
}
