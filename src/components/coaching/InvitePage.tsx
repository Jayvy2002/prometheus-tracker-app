import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import {
  useCoachingStore,
  setPendingInviteToken,
} from '../../stores/coachingStore';
import Button from '../ui/Button';
import AuthPage from '../auth/AuthPage';
import { toast } from '../ui/Toast';

export default function InvitePage() {
  const { t } = useTranslation();
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { previewInvite, acceptInvite } = useCoachingStore();
  const [coachName, setCoachName] = useState<string | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) {
      setValid(false);
      return;
    }
    setPendingInviteToken(token);
    previewInvite(token).then(preview => {
      setValid(preview.valid);
      setCoachName(preview.coach_name);
    });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    const result = await acceptInvite(token);
    setAccepting(false);
    if (!result.ok) {
      const key = result.error === 'expired' ? 'expired'
        : result.error === 'used' ? 'used'
        : result.error === 'already_coached' ? 'alreadyCoached'
        : result.error === 'self' ? 'self'
        : 'invalid';
      toast(t(`coaching.invite.errors.${key}`), 'error');
      return;
    }
    toast(t('coaching.invite.accepted', { name: result.coach_name || coachName || '' }));
    navigate('/dashboard');
  };

  if (!user) {
    return <AuthPage inviteCoachName={coachName} />;
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <img src="/logo.svg" alt="" className="w-12 h-12 mx-auto mb-4" />
        {valid === null ? (
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
        ) : valid ? (
          <>
            <h1 className="text-xl font-bold text-white mb-2">{t('coaching.invite.title')}</h1>
            <p className="text-sm text-neutral-400 mb-6">
              {t('coaching.invite.body', { name: coachName || t('coaching.invite.aCoach') })}
            </p>
            <Button onClick={handleAccept} loading={accepting} className="w-full">
              {t('coaching.invite.accept')}
            </Button>
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-4 text-sm text-neutral-500 hover:text-neutral-300"
            >
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-white mb-2">{t('coaching.invite.invalidTitle')}</h1>
            <p className="text-sm text-neutral-400 mb-6">{t('coaching.invite.invalidBody')}</p>
            <Button onClick={() => navigate('/dashboard')} className="w-full">{t('coaching.invite.goHome')}</Button>
          </>
        )}
      </div>
    </div>
  );
}
