import { useRef, useState } from 'react';
import { UserMinus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { useProfileStore } from '../../stores/profileStore';
import { toast } from '../ui/Toast';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Modal from '../ui/Modal';

export default function ClientCoachRelationshipPanel({ coachName }: { coachName: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const endMyCoachLink = useCoachingStore(s => s.endMyCoachLink);
  const fetchProfile = useProfileStore(s => s.fetchProfile);
  const [confirming, setConfirming] = useState(false);
  const [ending, setEnding] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');

  const endRelationship = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setEnding(true);
    setError('');
    try {
      const result = await endMyCoachLink();
      if (result.error) {
        setError(t('coachDiscovery.leave.error'));
        return;
      }
      if (user) await fetchProfile(user.id);
      setConfirming(false);
      toast(t('coachDiscovery.leave.success'));
      navigate('/dashboard', { replace: true });
    } catch {
      setError(t('coachDiscovery.leave.error'));
    } finally {
      inFlight.current = false;
      setEnding(false);
    }
  };

  return <>
    <Card className="mb-6 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center text-neutral-300 shrink-0">
          <UserMinus size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{t('coachDiscovery.leave.title')}</p>
          <p className="text-xs text-neutral-400 mt-1">{t('coachDiscovery.leave.current', { name: coachName })}</p>
        </div>
      </div>
      <Button variant="secondary" className="w-full" onClick={() => setConfirming(true)}>
        {t('coachDiscovery.leave.action')}
      </Button>
    </Card>

    <Modal open={confirming} onClose={() => !ending && setConfirming(false)} title={t('coachDiscovery.leave.confirmTitle')}>
      <div className="space-y-4">
        <p className="text-sm text-neutral-300">{t('coachDiscovery.leave.confirmBody')}</p>
        <ul className="text-sm text-neutral-400 list-disc pl-5 space-y-1">
          <li>{t('coachDiscovery.leave.kept')}</li>
          <li>{t('coachDiscovery.leave.stopped')}</li>
          <li>{t('coachDiscovery.leave.paused')}</li>
        </ul>
        <p className="text-xs text-neutral-500">{t('coachDiscovery.leave.billing')}</p>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" disabled={ending} onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" className="flex-1" loading={ending} onClick={() => void endRelationship()}>
            {t('coachDiscovery.leave.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  </>;
}
