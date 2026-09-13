import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import {
  useCoachingStore,
  setPendingInviteToken,
  clearPendingInviteToken,
} from '../../stores/coachingStore';
import Button from '../ui/Button';
import AuthPage from '../auth/AuthPage';
import { toast, ToastContainer } from '../ui/Toast';

export default function InvitePage() {
  const { t } = useTranslation();
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { previewInvite, acceptInvite } = useCoachingStore();
  const [coachName, setCoachName] = useState<string | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const inFlight = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    inFlight.current = false;
    setAccepting(false);
    setValid(null);
    setPreviewFailed(false);
    setCoachName(null);
    if (!token) { setValid(false); return; }
    setPendingInviteToken(token);
    previewInvite(token).then(preview => {
      if (generation.current !== current) return;
      if (preview.error) { setPreviewFailed(true); return; }
      setValid(preview.valid);
      setCoachName(preview.coach_name);
    }).catch(() => { if (generation.current === current) setPreviewFailed(true); });
    return () => { generation.current = current + 1; };
  }, [token, user?.id, previewInvite, retry]);

  const cancel = () => {
    if (inFlight.current) return;
    clearPendingInviteToken();
    navigate('/dashboard', { replace: true });
  };

  const handleAccept = async () => {
    if (!token || !user || inFlight.current || !valid) return;
    const current = generation.current;
    const owner = user.id;
    const isCurrent = () => generation.current === current && useAuthStore.getState().user?.id === owner;
    inFlight.current = true;
    setAccepting(true);
    try {
      const result = await acceptInvite(token);
      if (!isCurrent()) return;
      if (!result.ok) {
        const key = result.error === 'expired' ? 'expired'
          : result.error === 'used' ? 'used'
          : result.error === 'already_coached' ? 'alreadyCoached'
          : result.error === 'self' ? 'self' : result.error === 'invalid' ? 'invalid' : null;
        toast(t(key ? `coaching.invite.errors.${key}` : 'coaching.invite.retryError'), 'error');
        return;
      }
      toast(t('coaching.invite.accepted', { name: result.coach_name || coachName || t('coaching.invite.aCoach') }));
      navigate('/dashboard', { replace: true });
    } catch {
      if (isCurrent()) toast(t('coaching.invite.retryError'), 'error');
    } finally {
      if (isCurrent()) { inFlight.current = false; setAccepting(false); }
    }
  };

  if (!user) {
    return <AuthPage fromInvite inviteCoachName={coachName} />;
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <ToastContainer />
      <div className="w-full max-w-sm text-center">
        <img src="/logo.svg" alt="" className="w-12 h-12 mx-auto mb-4" />
        {previewFailed ? (
          <div className="space-y-4">
            <p role="alert">{t('coaching.invite.previewError')}</p>
            <Button onClick={() => setRetry(n => n + 1)}>{t('errors.retry')}</Button>
            <Button variant="secondary" onClick={cancel}>{t('common.cancel')}</Button>
          </div>
        ) : valid === null ? (
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
        ) : valid ? (
          <>
            <h1 className="text-xl font-bold text-white mb-2">{t('coaching.invite.title')}</h1>
            <p className="text-sm text-neutral-400 mb-6">
              {t('coaching.invite.body', { name: coachName || t('coaching.invite.aCoach') })}
            </p>
            <p className="text-sm text-neutral-300 mb-6">{t('coaching.invite.sharing')}</p>
            <Button onClick={handleAccept} loading={accepting} className="w-full">
              {t('coaching.invite.accept')}
            </Button>
            <button
              onClick={cancel}
              disabled={accepting}
              className="mt-4 min-h-11 text-sm text-neutral-500 hover:text-neutral-300"
            >
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-white mb-2">{t('coaching.invite.invalidTitle')}</h1>
            <p className="text-sm text-neutral-400 mb-6">{t('coaching.invite.invalidBody')}</p>
            <Button onClick={cancel} className="w-full">{t('coaching.invite.goHome')}</Button>
          </>
        )}
      </div>
    </div>
  );
}
