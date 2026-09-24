import { useTranslation } from 'react-i18next';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { formatDate } from '../../lib/utils';
import { useMyEntitlements } from '../../features/entitlements/hooks/useMyEntitlements';
import {
  accessLabelKey,
  showsEndDate,
  type ProductEntitlement,
} from '../../features/entitlements/domain/entitlements';

function AccessLine({ label, entitlement }: { label: string; entitlement: ProductEntitlement }) {
  const { t, i18n } = useTranslation();
  const date = showsEndDate(entitlement) && entitlement.endsAt
    ? t(entitlement.access === 'expired' ? 'entitlements.since' : 'entitlements.until', {
      date: formatDate(entitlement.endsAt, i18n.language),
    })
    : null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm text-neutral-400">{label}</span>
      <span className="text-sm text-white text-right" data-entitlement-access={entitlement.access}>
        {t(accessLabelKey(entitlement.access))}
        {date ? <span className="text-neutral-500"> · {date}</span> : null}
      </span>
    </div>
  );
}

/**
 * Read-only view of the account's commercial rights (P6.1). It shows state; it
 * never blocks, sells or links to a payment. Coach line only for a Coach.
 */
export default function AccessCard({ userId, isCoach }: { userId: string | undefined; isCoach: boolean }) {
  const { t } = useTranslation();
  const state = useMyEntitlements(userId);

  return (
    <Card className="mb-3" data-testid="access-card">
      <p className="text-sm font-medium text-white mb-1">{t('entitlements.title')}</p>
      {state.status === 'loading' ? (
        <p className="text-sm text-neutral-500" role="status">{t('common.loading')}</p>
      ) : state.status === 'error' ? (
        <div className="space-y-2">
          <p className="text-sm text-neutral-400" role="alert">{t('entitlements.loadError')}</p>
          <Button size="sm" variant="secondary" onClick={state.retry}>{t('errors.retry')}</Button>
        </div>
      ) : (
        <>
          <AccessLine label={t('entitlements.personal')} entitlement={state.data.solo} />
          {isCoach && (
            <>
              <AccessLine label={t('entitlements.coach')} entitlement={state.data.coach} />
              <p className="text-xs text-neutral-500">
                {t('entitlements.activeClients', { count: state.data.coach.activeClients })}
                {state.data.coach.clientLimit != null
                  ? ` ${t('entitlements.clientLimit', { limit: state.data.coach.clientLimit })}`
                  : ''}
              </p>
              {state.data.coach.overLimit && (
                <p className="text-xs text-amber-300 mt-1">{t('entitlements.overLimit')}</p>
              )}
            </>
          )}
          <p className="text-xs text-neutral-500 mt-2">{t('entitlements.noEnforcement')}</p>
        </>
      )}
    </Card>
  );
}
