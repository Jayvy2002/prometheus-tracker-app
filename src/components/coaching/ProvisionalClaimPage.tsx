import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { clearPendingDossierToken, setPendingDossierToken } from '../../stores/coachingStore';
import { formatWeight } from '../../lib/utils';
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
  const [acknowledgeCollisions, setAcknowledgeCollisions] = useState(false);
  const unit = useProfileStore(s => s.profile?.unit_weight === 'lbs' ? 'lbs' : 'kg');
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
    setAcknowledgeCollisions(false);
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

  const leave = () => {
    clearPendingDossierToken();
    navigate('/dashboard');
  };

  const confirm = async () => {
    if (!token || !user || busy || !acceptData || !preview?.revision) return;
    const collisions = preview.collisions;
    const hasCollisions = collisions.files.length + collisions.session_dates.length + collisions.weight_dates.length > 0;
    if (hasCollisions && !acknowledgeCollisions) return;
    const current = generation.current;
    setBusy(true);
    const result = await confirmProvisionalClaim({
      token,
      acceptData,
      acceptCoaching,
      revision: preview.revision,
      acknowledgeCollisions,
    });
    if (generation.current !== current) return;
    setBusy(false);
    if (result.error || !result.data) {
      const key = provisionalErrorI18nKey(result.error);
      if (key.endsWith('content_changed')) {
        toast(t(key), 'error');
        setRetry((value) => value + 1);
        return;
      }
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
            <Button variant="secondary" onClick={leave}>{t('coaching.provisional.claim.goHome')}</Button>
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
            <Button className="w-full" onClick={leave}>{t('coaching.provisional.claim.goHome')}</Button>
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
                      {session.details.map((exercise) => (
                        <div key={`${session.date}-${exercise.name}`} className="mt-2">
                          <p className="text-sm text-neutral-200">{exercise.name}</p>
                          {exercise.notes ? (
                            <p className="text-xs text-neutral-400">{t('coaching.provisional.claim.notes', { notes: exercise.notes })}</p>
                          ) : null}
                          <ul className="mt-1 space-y-1">
                            {exercise.sets.map((set) => (
                              <li key={`${exercise.name}-${set.order}`} className="text-xs text-neutral-300">
                                {set.weight_kg == null
                                  ? t('coaching.provisional.claim.setLineNoWeight', {
                                    order: set.order,
                                    reps: set.reps ?? '—',
                                    rir: set.rir ?? '—',
                                  })
                                  : t('coaching.provisional.claim.setLine', {
                                    order: set.order,
                                    weight: formatWeight(set.weight_kg, unit),
                                    reps: set.reps ?? '—',
                                    rir: set.rir ?? '—',
                                  })}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h2 className="text-sm font-medium text-white mb-1">
                {t('coaching.provisional.counts.weights', { count: preview.weight_count })}
              </h2>
              <ul className="space-y-1">
                {(preview.weights.length ? preview.weights : preview.weight_dates.map((date) => ({
                  measured_at: date,
                  weight_kg: null,
                  notes: '',
                }))).map((weight) => (
                  <li key={`${weight.measured_at}-${weight.weight_kg ?? 'x'}`} className="text-sm text-neutral-400">
                    {weight.weight_kg == null
                      ? weight.measured_at
                      : t('coaching.provisional.claim.weightLine', {
                        date: weight.measured_at,
                        weight: formatWeight(weight.weight_kg, unit),
                      })}
                    {weight.notes ? ` · ${weight.notes}` : ''}
                  </li>
                ))}
                {preview.weights.length === 0 && preview.weight_dates.length === 0 ? (
                  <li className="text-sm text-neutral-400">{t('coaching.provisional.claim.noWeights')}</li>
                ) : null}
              </ul>
            </section>
            {(preview.collisions.files.length + preview.collisions.session_dates.length + preview.collisions.weight_dates.length) > 0 ? (
              <section className="rounded-xl border border-amber-800 px-3 py-2 space-y-1">
                <h2 className="text-sm font-medium text-amber-200">{t('coaching.provisional.claim.collisionsTitle')}</h2>
                {preview.collisions.files.length ? (
                  <p className="text-xs text-neutral-300">{t('coaching.provisional.claim.collisionsFiles', { list: preview.collisions.files.join(', ') })}</p>
                ) : null}
                {preview.collisions.session_dates.length ? (
                  <p className="text-xs text-neutral-300">{t('coaching.provisional.claim.collisionsSessions', { list: preview.collisions.session_dates.join(', ') })}</p>
                ) : null}
                {preview.collisions.weight_dates.length ? (
                  <p className="text-xs text-neutral-300">{t('coaching.provisional.claim.collisionsWeights', { list: preview.collisions.weight_dates.join(', ') })}</p>
                ) : null}
                <label className="flex items-start gap-2 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    checked={acknowledgeCollisions}
                    onChange={(event) => setAcknowledgeCollisions(event.target.checked)}
                    disabled={busy}
                    className="mt-1 accent-blue-500"
                  />
                  <span>{t('coaching.provisional.claim.acknowledgeCollisions')}</span>
                </label>
              </section>
            ) : null}
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
            <Button
              className="w-full"
              onClick={() => void confirm()}
              loading={busy}
              disabled={!acceptData || !preview.revision || (
                (preview.collisions.files.length + preview.collisions.session_dates.length + preview.collisions.weight_dates.length) > 0
                && !acknowledgeCollisions
              )}
            >
              {t('coaching.provisional.claim.confirm')}
            </Button>
            <button
              type="button"
              onClick={leave}
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
