import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { clearPendingDossierToken, setPendingDossierToken } from '../../stores/coachingStore';
import Button from '../ui/Button';
import AuthPage from '../auth/AuthPage';
import { toast, ToastContainer } from '../ui/Toast';
import {
  confirmProvisionalClaim,
  previewProvisionalClaim,
  provisionalErrorI18nKey,
  type ProvisionalClaimPreview,
} from '../../features/provisional/api/provisionalApi';

export default function ProvisionalClaimPage() {
  const { t } = useTranslation();
  const { token } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [preview, setPreview] = useState<ProvisionalClaimPreview | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acceptData, setAcceptData] = useState(false);
  const [acceptCoaching, setAcceptCoaching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const started = generation.current + 1;
    generation.current = started;
    setLoading(true);
    setFailed(null);
    setPreview(null);
    setAcceptData(false);
    setAcceptCoaching(false);
    if (!token) {
      setLoading(false);
      setFailed('coaching.provisional.errors.invite_invalid');
      return;
    }
    setPendingDossierToken(token);
    if (!user) {
      setLoading(false);
      return;
    }
    previewProvisionalClaim(token).then((result) => {
      if (generation.current !== started) return;
      setLoading(false);
      if (result.error || !result.data) {
        setFailed(provisionalErrorI18nKey(result.error));
        return;
      }
      setPreview(result.data);
    }).catch(() => {
      if (generation.current === started) {
        setLoading(false);
        setFailed('coaching.provisional.errors.generic');
      }
    });
    return () => { generation.current = started + 1; };
  }, [token, user?.id, retry]);

  const confirm = async () => {
    if (!token || !user || busy || !acceptData) return;
    const current = generation.current;
    setBusy(true);
    const result = await confirmProvisionalClaim({ token, acceptData, acceptCoaching });
    if (generation.current !== current) return;
    setBusy(false);
    if (result.error || !result.data) {
      const key = provisionalErrorI18nKey(result.error);
      setFailed(key);
      toast(t(key), 'error');
      return;
    }
    clearPendingDossierToken();
    setPreview({ ...result.data, already_attached: true });
    toast(t('coaching.provisional.claim.done'));
  };

  if (!user) {
    return (
      <AuthPage
        returnHere
        banner={t('coaching.provisional.claim.authBanner')}
      />
    );
  }

  const title = preview?.coach_name
    ? t('coaching.provisional.claim.title', { name: preview.coach_name })
    : t('coaching.provisional.claim.titleNoName');

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-10">
      <ToastContainer />
      <div className="w-full max-w-md">
        <img src="/logo.svg" alt="" className="w-12 h-12 mx-auto mb-4" />
        {loading ? (
          <div className="flex justify-center" role="status" aria-label={t('coaching.provisional.claim.loading')}>
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : failed ? (
          <div className="space-y-4 text-center">
            <h1 className="text-xl font-bold text-white">{t('coaching.provisional.claim.unavailable')}</h1>
            <p role="alert" className="text-sm text-neutral-300">{t(failed)}</p>
            <Button onClick={() => setRetry((value) => value + 1)}>{t('errors.retry')}</Button>
            <Button variant="secondary" onClick={() => navigate('/dashboard')}>{t('coaching.provisional.claim.goHome')}</Button>
          </div>
        ) : preview?.already_attached ? (
          <div className="space-y-4 text-center">
            <h1 className="text-xl font-bold text-white">{t('coaching.provisional.claim.already')}</h1>
            <p className="text-sm text-neutral-300">
              {t('coaching.provisional.claim.alreadyCounts', {
                workouts: preview.workout_count,
                weights: preview.weight_count,
                skipped: preview.skipped_weight_count,
              })}
            </p>
            {preview.coaching_status ? (
              <p className="text-sm text-neutral-400">
                {t(`coaching.provisional.claim.coachingStatus.${
                  ['not_requested', 'active', 'already_coached', 'coach_unavailable', 'invalid_target'].includes(preview.coaching_status)
                    ? preview.coaching_status
                    : 'invalid_target'
                }`)}
              </p>
            ) : null}
            <Button className="w-full" onClick={() => navigate('/dashboard')}>{t('coaching.provisional.claim.goHome')}</Button>
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-white text-center">{title}</h1>
            {preview.display_name ? (
              <p className="text-sm text-neutral-400 text-center">{preview.display_name}</p>
            ) : null}
            <p className="text-sm text-neutral-300">{t('coaching.provisional.claim.intro')}</p>
            <section>
              <h2 className="text-sm font-medium text-white mb-2">
                {t('coaching.provisional.counts.workouts', { count: preview.workout_count })}
              </h2>
              {preview.sessions.length === 0 ? (
                <p className="text-sm text-neutral-500">{t('coaching.provisional.claim.noSessions')}</p>
              ) : (
                <ul className="space-y-2">
                  {preview.sessions.map((session) => (
                    <li key={`${session.date}-${session.name}`} className="rounded-xl border border-neutral-800 px-3 py-2">
                      <p className="text-sm text-white">
                        {session.name && session.name !== session.date
                          ? t('coaching.provisional.claim.sessionLine', { date: session.date, name: session.name })
                          : session.date}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {session.exercises.length
                          ? t('coaching.provisional.claim.exercises', { list: session.exercises.join(', ') })
                          : t('coaching.provisional.claim.noExercises')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h2 className="text-sm font-medium text-white mb-1">
                {t('coaching.provisional.counts.weights', { count: preview.weight_count })}
              </h2>
              <p className="text-sm text-neutral-400">
                {preview.weight_dates.length ? preview.weight_dates.join(', ') : t('coaching.provisional.claim.noWeights')}
              </p>
            </section>
            <label className="flex items-start gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={acceptData}
                onChange={(event) => setAcceptData(event.target.checked)}
                disabled={busy}
                className="mt-1 accent-blue-500"
              />
              <span>{t('coaching.provisional.claim.acceptData')}</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={acceptCoaching}
                onChange={(event) => setAcceptCoaching(event.target.checked)}
                disabled={busy}
                className="mt-1 accent-blue-500"
              />
              <span>
                {t('coaching.provisional.claim.acceptCoaching')}
                <span className="block text-xs text-neutral-500 mt-1">{t('coaching.provisional.claim.coachingHint')}</span>
              </span>
            </label>
            <Button className="w-full" onClick={() => void confirm()} loading={busy} disabled={!acceptData}>
              {t('coaching.provisional.claim.confirm')}
            </Button>
            <button
              type="button"
              onClick={() => {
                clearPendingDossierToken();
                navigate('/dashboard');
              }}
              className="block w-full min-h-11 text-sm text-neutral-500"
            >
              {t('common.cancel')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
