import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, MessageSquare } from 'lucide-react';
import {
  PROSPECT_SNAPSHOT_KEYS,
  isProspectConversationStatus,
  requestActions,
  requestActivatesFollow,
  requestRelationshipCopyKey,
  type CoachingRequest,
  type MarketplaceReport,
} from '../../lib/marketplace';
import { DIRECT_INVITE_CONSENT_SCOPES } from '../../lib/relationshipConsent';
import Button from '../ui/Button';
import MarketplaceReportForm from './MarketplaceReportForm';
import { REQUEST_STEPS, requestStep } from './marketplaceCopy';

type Action = ReturnType<typeof requestActions>[number];

function Stepper({ status }: { status: CoachingRequest['status'] }) {
  const { t } = useTranslation();
  const step = requestStep(status);
  if (!step) return null;
  const current = REQUEST_STEPS.indexOf(step);
  return (
    <ol className="flex items-center gap-2" aria-label={t('marketplace.progressLabel')}>
      {REQUEST_STEPS.map((key, index) => {
        const done = index <= current;
        return (
          <li key={key} className="flex min-w-0 flex-1 items-center gap-2" aria-current={index === current ? 'step' : undefined}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
              done ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-500'
            }`}>
              {done ? <Check size={13} aria-hidden="true" /> : index + 1}
            </span>
            <span className={`truncate text-xs ${done ? 'text-white' : 'text-neutral-500'}`}>{t(`marketplace.step_${key}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One request, from the side of whoever reads it. The status sentence stays
 * the contract (« not active yet », « not a payment »); the rest is folded.
 */
export default function RequestCard({
  row,
  owner,
  busy,
  onAction,
  onReported,
}: {
  row: CoachingRequest;
  owner: string;
  busy: boolean;
  onAction: (row: CoachingRequest, action: Action) => void;
  onReported: (report: MarketplaceReport) => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const mine = row.client_id === owner;
  const actions = requestActions(row, owner);
  const primary = actions.filter(action => action !== 'withdrawn');
  const relationshipCopy = requestRelationshipCopyKey(row, owner);
  const snapshotKeys = PROSPECT_SNAPSHOT_KEYS.filter(key => key !== 'summary' && row.prospect_snapshot?.[key]);

  return (
    <article className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-white">
            {mine ? row.coach_name || t('marketplace.coachUnavailableName') : row.public_name}
          </h3>
          <time className="text-xs text-neutral-500" dateTime={row.created_at}>
            {new Date(row.created_at).toLocaleDateString(i18n.language)}
          </time>
        </div>
        {mine && !requestActivatesFollow(row.status) && (
          <Link className="shrink-0 text-xs text-blue-300 hover:text-white min-h-11 inline-flex items-center" to={`/coaches/${row.coach_id}`}>
            {t('marketplace.viewCoach')}
          </Link>
        )}
      </header>

      {mine && <Stepper status={row.status} />}

      <p className="text-sm text-neutral-200">
        {!mine && (row.status === 'pending' || row.status === 'coach_accepted')
          ? t(`marketplace.coachSide_${row.status}`)
          : t(`marketplace.${row.status}`)}
      </p>

      {!mine && (
        <div className="space-y-2 rounded-xl bg-neutral-950/60 p-3">
          <p className="whitespace-pre-wrap break-words text-sm text-neutral-200">{row.summary}</p>
          {snapshotKeys.length > 0 && (
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              {snapshotKeys.map(key => (
                <div key={key} className="min-w-0">
                  <dt className="text-xs text-neutral-500">{t(`marketplace.snapshot_${key}`)}</dt>
                  <dd className="break-words text-neutral-300">{row.prospect_snapshot?.[key]}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
      {mine && (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer text-neutral-400 flex items-center">{t('marketplace.viewRequestDetails')}</summary>
          <p className="whitespace-pre-wrap break-words text-neutral-300">{row.summary}</p>
          {snapshotKeys.length > 0 && (
            <dl className="mt-2 space-y-1">
              {snapshotKeys.map(key => (
                <div key={key}>
                  <dt className="text-xs text-neutral-500">{t(`marketplace.snapshot_${key}`)}</dt>
                  <dd className="break-words text-neutral-300">{row.prospect_snapshot?.[key]}</dd>
                </div>
              ))}
            </dl>
          )}
        </details>
      )}

      {row.status === 'pending' && row.coach_id === owner && (
        <p className="text-xs text-neutral-400">{t('marketplace.acceptContinuesProspect')}</p>
      )}
      {row.status === 'coach_accepted' && mine && (
        <div className="space-y-1">
          <p className="text-sm text-neutral-300">{t('marketplace.confirmActivatesFollow')}</p>
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer text-neutral-400 flex items-center">{t('marketplace.confirmScopesReminder')}</summary>
            <ul className="list-disc space-y-1 pl-5 text-neutral-400">
              {DIRECT_INVITE_CONSENT_SCOPES.map(scope => (
                <li key={scope}>{t(`coaching.invite.scopes.${scope}`)}</li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {relationshipCopy && (
        <div className="space-y-2">
          <p className="text-sm text-neutral-300">{t(relationshipCopy)}</p>
          {row.relationship_state === 'active' && row.coach_id === owner && (
            <Button size="sm" onClick={() => navigate(`/clients/${row.client_id}`)}>{t('marketplace.openClient')}</Button>
          )}
          {row.relationship_state === 'active' && mine && (
            <Button size="sm" onClick={() => navigate('/dashboard')}>{t('marketplace.goDashboard')}</Button>
          )}
        </div>
      )}

      {(primary.length > 0 || isProspectConversationStatus(row.status)) && (
        <div className="flex flex-wrap items-center gap-2">
          {primary.map(action => (
            <Button
              key={action}
              size="sm"
              disabled={busy}
              variant={action === 'declined' ? 'secondary' : 'primary'}
              onClick={() => onAction(row, action)}
            >
              {t(`marketplace.action_${action}`)}
            </Button>
          ))}
          {isProspectConversationStatus(row.status) && (
            <Link
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-blue-300 hover:text-white"
              to={row.coach_id === owner ? `/messages/${row.client_id}` : '/messages'}
            >
              <MessageSquare size={15} aria-hidden="true" />{t('marketplace.openConversation')}
            </Link>
          )}
        </div>
      )}

      {/* Quiet footer: withdrawing and reporting stay reachable, not prominent. */}
      <div className="flex flex-wrap items-start gap-x-4 border-t border-neutral-800 pt-1">
        {actions.includes('withdrawn') && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(row, 'withdrawn')}
            className="inline-flex min-h-11 items-center text-xs text-neutral-500 hover:text-neutral-300 disabled:opacity-50"
          >
            {t('marketplace.action_withdrawn')}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <MarketplaceReportForm
            owner={owner}
            targetUserId={row.coach_id === owner ? row.client_id : row.coach_id}
            relatedRequestId={row.id}
            subjectType="behavior"
            onSubmitted={onReported}
          />
        </div>
      </div>
    </article>
  );
}
