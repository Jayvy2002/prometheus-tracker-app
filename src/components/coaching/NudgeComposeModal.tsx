import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { firstNameOf } from '../../lib/coachQueue';
import { resolveNudgeBody } from '../../lib/coachSettings';
import type { CoachNudgeTemplateKey, CoachNudgeTemplateSet } from '../../lib/types';

const TEMPLATE_KEYS: CoachNudgeTemplateKey[] = ['missed_training', 'missed_checkins', 'general_followup'];

interface NudgeComposeModalProps {
  open: boolean;
  clientName: string;
  templateKey: CoachNudgeTemplateKey;
  sending?: boolean;
  showTemplatePicker?: boolean;
  showSaveNote?: boolean;
  templates?: CoachNudgeTemplateSet;
  onClose: () => void;
  onSend: (body: string, opts?: { saveNote?: boolean; templateKey: CoachNudgeTemplateKey }) => void;
}

export default function NudgeComposeModal({
  open,
  clientName,
  templateKey,
  sending,
  showTemplatePicker,
  showSaveNote,
  templates,
  onClose,
  onSend,
}: NudgeComposeModalProps) {
  const { t, i18n } = useTranslation();
  const name = firstNameOf(clientName) || clientName;
  const [key, setKey] = useState<CoachNudgeTemplateKey>(templateKey);
  const [body, setBody] = useState('');
  const [saveNote, setSaveNote] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKey(templateKey);
    setSaveNote(false);
    const fallback = t(`coaching.queue.templates.${templateKey}`, { name });
    setBody(resolveNudgeBody(templateKey, name, i18n.language, templates, fallback));
  }, [open, templateKey, name, t, i18n.language, templates]);

  const applyTemplate = (next: CoachNudgeTemplateKey) => {
    setKey(next);
    const fallback = t(`coaching.queue.templates.${next}`, { name });
    setBody(resolveNudgeBody(next, name, i18n.language, templates, fallback));
  };

  const canSend = body.trim().length > 0 && !sending;

  return (
    <Modal open={open} onClose={onClose} title={t('coaching.queue.composeTitle', { name })}>
      <p className="text-xs text-neutral-500 mb-3">{t('coaching.queue.composeHint')}</p>
      {showTemplatePicker && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {TEMPLATE_KEYS.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => applyTemplate(k)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium ${
                key === k ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400'
              }`}
            >
              {t(`coaching.queue.templateLabels.${k}`)}
            </button>
          ))}
        </div>
      )}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={7}
        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white
          placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
          transition-all duration-200 resize-y min-h-[140px]"
      />
      {showSaveNote && (
        <label className="flex items-center gap-2 mt-3 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={saveNote}
            onChange={e => setSaveNote(e.target.checked)}
            className="accent-blue-500"
          />
          {t('coaching.queue.alsoSaveNote')}
        </label>
      )}
      <div className="flex items-center justify-end gap-2 mt-4">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={sending}>
          {t('common.cancel')}
        </Button>
        <Button
          size="sm"
          onClick={() => onSend(body, { saveNote, templateKey: key })}
          disabled={!canSend}
          loading={sending}
        >
          {t('coaching.queue.send')}
        </Button>
      </div>
    </Modal>
  );
}
