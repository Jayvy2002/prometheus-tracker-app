import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCoachingStore } from '../../stores/coachingStore';
import { useAccountContext } from '../../lib/useAccountContext';
import { COACH_HAS_ACTIVE_CLIENTS } from '../../lib/coachModeGuard';
import { userFacingError } from '../../lib/userFacingError';
import { toast } from '../ui/Toast';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';

/** Capacité coach, distincte d'une fiche annuaire et d'un abonnement. */
export default function BecomeCoachPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const context = useAccountContext();
  const canCoach = context.capabilities.coach;
  const { enableCoachMode, disableCoachMode, countActiveCoachLinks, selectAccountWorkspace } = useCoachingStore();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ count: number } | null>(null);

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    const result = await enableCoachMode();
    setBusy(false);
    if (result.error) toast(userFacingError(result.error, t('errors.generic')), 'error');
    else toast(t('coaching.coachModeOn'), 'success');
  };

  const askDisable = async () => {
    if (busy) return;
    setBusy(true);
    const counted = await countActiveCoachLinks();
    setBusy(false);
    if (counted.error || counted.count == null) {
      toast(t('coaching.disableMode.errorCount'), 'error');
      return;
    }
    setDialog({ count: counted.count });
  };

  const confirmDisable = async () => {
    if (busy || (dialog?.count ?? 0) > 0) return;
    setBusy(true);
    const result = await disableCoachMode();
    setBusy(false);
    if (result.error === COACH_HAS_ACTIVE_CLIENTS) {
      toast(t('coaching.disableMode.errorBlocked'), 'error');
      return;
    }
    if (result.error) {
      toast(userFacingError(result.error, t('errors.generic')), 'error');
      return;
    }
    setDialog(null);
  };

  return (
    <div className="px-4 pt-6 pb-16 max-w-lg">
      <PageHeader title={t('coaching.becomeCoach')} backTo="/profile" />
      <p className="text-sm text-neutral-300 mb-6">{t('coaching.becomeCoachBody')}</p>
      {canCoach ? (
        <div className="space-y-3">
          <Button className="w-full" onClick={() => { selectAccountWorkspace('coaching'); navigate('/clients'); }}>
            {t('coaching.disableMode.seeClients')}
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => void askDisable()} disabled={busy}>
            {t('coaching.disableMode.confirmZero')}
          </Button>
        </div>
      ) : (
        <Button className="w-full" onClick={() => void enable()} disabled={busy}>
          {t('coaching.enableCta')}
        </Button>
      )}
      <Modal
        open={dialog != null}
        onClose={() => setDialog(null)}
        title={dialog && dialog.count > 0 ? t('coaching.disableMode.blockedTitle') : t('coaching.disableMode.title')}
      >
        {dialog && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-300">
              {dialog.count > 0
                ? t('coaching.disableMode.blockedBody', { count: dialog.count })
                : t('coaching.disableMode.bodyZero')}
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDialog(null)}>
                {dialog.count > 0 ? t('coaching.disableMode.understood') : t('common.cancel')}
              </Button>
              {dialog.count === 0 && (
                <Button className="flex-1" onClick={() => void confirmDisable()} disabled={busy}>
                  {t('coaching.disableMode.confirmZero')}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
