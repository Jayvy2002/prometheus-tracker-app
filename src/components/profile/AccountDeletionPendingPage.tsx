import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import Button from '../ui/Button';
import { useAuthStore } from '../../stores/authStore';
import { canCancel, daysLeft, type AccountDeletionState } from '../../features/account/domain/accountDeletion';
import { formatDate } from '../../lib/utils';
import { userFacingError } from '../../lib/userFacingError';

/**
 * Vision §30 — shown instead of the app while a deletion is requested:
 * clear date, one button to undo, one to leave. Nothing else is reachable.
 */
export default function AccountDeletionPendingPage({
  state,
  busy,
  onCancel,
}: {
  state: AccountDeletionState;
  busy: boolean;
  onCancel: () => Promise<{ error: string | null }>;
}) {
  const { t, i18n } = useTranslation();
  const signOut = useAuthStore(s => s.signOut);
  const [error, setError] = useState<string | null>(null);
  const days = daysLeft(state.purgeAfter);

  const cancel = async () => {
    setError(null);
    const result = await onCancel();
    if (result.error) setError(userFacingError(result.error, t('accountDeletion.cancelFailed')));
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6" data-testid="account-deletion-pending">
      <div className="w-full max-w-md space-y-5 text-center">
        <ShieldAlert size={36} className="mx-auto text-amber-300" aria-hidden="true" />
        <h1 className="text-xl font-bold">{t('accountDeletion.title')}</h1>
        {state.status === 'purging' ? (
          <p className="text-sm text-neutral-300">{t('accountDeletion.purging')}</p>
        ) : (
          <>
            <p className="text-sm text-neutral-300">
              {state.purgeAfter
                ? t('accountDeletion.scheduled', { date: formatDate(state.purgeAfter, i18n.language), count: days ?? 0 })
                : t('accountDeletion.scheduledNoDate')}
            </p>
            <p className="text-xs text-neutral-500">{t('accountDeletion.meanwhile')}</p>
            {state.status === 'failed' ? (
              <p className="text-xs text-amber-300" role="status">{t('accountDeletion.failed')}</p>
            ) : null}
          </>
        )}
        {error ? <p className="text-sm text-rose-400" role="alert">{error}</p> : null}
        <div className="flex flex-col gap-2">
          {canCancel(state) ? (
            <Button onClick={() => void cancel()} loading={busy} className="w-full">
              {t('accountDeletion.cancel')}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => void signOut()} className="w-full">
            {t('profile.signOut')}
          </Button>
        </div>
      </div>
    </main>
  );
}
