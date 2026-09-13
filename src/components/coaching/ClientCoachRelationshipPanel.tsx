import { useEffect, useRef, useState } from 'react';
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
  const generation = useRef(0);

  useEffect(() => {
    const started = generation.current + 1;
    generation.current = started;
    inFlight.current = false;
    setEnding(false);
    setConfirming(false);
    setError('');
    return () => { generation.current = started + 1; };
  }, [user?.id]);

  const endRelationship = async () => {
    if (inFlight.current || !user) return;
    const startedPath = window.location.pathname;
    const current = generation.current;
    const isCurrent = () => generation.current === current && useAuthStore.getState().user?.id === user.id;
    inFlight.current = true;
    setEnding(true);
    setError('');
    try {
      const result = await endMyCoachLink();
      if (useAuthStore.getState().user !== user) return;
      if (result.error) {
        if (isCurrent()) setError(t('coaching.leave.error'));
        return;
      }
      if (isCurrent()) setConfirming(false);
      toast(t('coaching.leave.success'));
      if (window.location.pathname === startedPath) navigate('/dashboard', { replace: true });
      void fetchProfile(user.id, { silent: true }).catch(() => undefined);
    } catch {
      if (isCurrent()) setError(t('coaching.leave.error'));
    } finally {
      if (isCurrent()) {
        inFlight.current = false;
        setEnding(false);
      }
    }
  };

  return (
    <>
      <Card className="mb-6 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center text-neutral-300 shrink-0">
            <UserMinus size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">{t('coaching.leave.title')}</p>
            <p className="text-xs text-neutral-400 mt-1">{t('coaching.leave.current', { name: coachName })}</p>
          </div>
        </div>
        <Button variant="secondary" className="w-full" onClick={() => setConfirming(true)}>
          {t('coaching.leave.action')}
        </Button>
      </Card>

      <Modal open={confirming} onClose={() => !ending && setConfirming(false)} title={t('coaching.leave.confirmTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-neutral-300">{t('coaching.leave.confirmBody')}</p>
          <ul className="text-sm text-neutral-400 list-disc pl-5 space-y-1">
            <li>{t('coaching.leave.kept')}</li>
            <li>{t('coaching.leave.stopped')}</li>
            <li>{t('coaching.leave.paused')}</li>
          </ul>
          {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" disabled={ending} onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" className="flex-1" loading={ending} onClick={() => void endRelationship()}>
              {t('coaching.leave.confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
