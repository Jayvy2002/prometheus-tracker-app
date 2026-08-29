import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { foldText } from '../../lib/coachText';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

interface RemoveClientDialogProps {
  open: boolean;
  clientName: string;
  removing?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function namesConfirmEqual(typed: string, expected: string): boolean {
  const left = foldText(typed);
  const right = foldText(expected);
  return left.length > 0 && left === right;
}

export default function RemoveClientDialog({
  open,
  clientName,
  removing,
  onClose,
  onConfirm,
}: RemoveClientDialogProps) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const matches = namesConfirmEqual(typed, clientName);

  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={() => {
        setTyped('');
        onClose();
      }}
      title={t('coaching.removeClient.title', { name: clientName })}
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-300">{t('coaching.removeClient.body')}</p>
        <p className="text-sm text-rose-400 font-medium">
          {t('coaching.removeClient.hardUndo')}
          {' '}
          {t('common.cannotBeUndone')}
        </p>
        <div>
          <label className="block text-xs text-neutral-500 mb-1.5">
            {t('coaching.removeClient.typeName', { name: clientName })}
          </label>
          <input
            type="text"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={clientName}
            autoComplete="off"
            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setTyped('');
              onClose();
            }}
            className="flex-1"
            disabled={removing}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            className="flex-1"
            disabled={!matches || removing}
            loading={removing}
          >
            <Trash2 size={14} />
            {t('coaching.removeClient.confirmCta', { name: clientName })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
