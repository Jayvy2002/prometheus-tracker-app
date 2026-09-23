import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useResourcePermissions } from '../../lib/useResourcePermissions';
import { listAthleteSignalsForWatch } from '../../features/signals/domain/athleteSignalsApi';
import { listLatestAthleteDecisionsForWatch } from '../../features/signals/domain/decisionLogApi';
import { listLatestAthleteWeeklyReviewForWatch } from '../../features/signals/domain/weeklyReviewApi';
import { correctAthleteWatchContext } from '../../features/signals/domain/watchContextApi';
import type { WatchContextCorrectionAction } from '../../features/signals/domain/watchContext';
import { decideAthleteWatchProposal } from '../../features/signals/domain/watchProposalApi';
import {
  isWatchProposalReviewId,
  watchProposalReasonRequired,
  type WatchProposalDecision,
} from '../../features/signals/domain/watchProposal';
import {
  buildPrometheusWatchItems,
  type PrometheusWatchItem,
} from '../../features/signals/domain/explainability';
import type { AthleteDecisionLog, AthleteSignal, AthleteWeeklyReview } from '../../lib/types';
import { formatDate } from '../../lib/utils';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Modal from '../ui/Modal';

interface Props {
  athleteId: string;
  viewer: 'self' | 'coach';
  hasActiveRelationship?: boolean;
  /** The /watch page already carries the title: the panel does not repeat it. */
  showHeader?: boolean;
}

type WatchLoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; signals: AthleteSignal[]; decisions: AthleteDecisionLog[]; review: AthleteWeeklyReview | null }
  | { phase: 'error' };

interface CorrectionDraft {
  signalId: string;
  headlineKey: string;
  action: WatchContextCorrectionAction;
  seenUpdatedAt: string;
  seenEvidence: Record<string, unknown>;
}

interface DecisionDraft {
  signalId: string;
  headlineKey: string;
  proposalKey: string;
  proposalDetail: PrometheusWatchItem['currentProposalDetail'];
  decision: WatchProposalDecision;
  weekStart: string;
  reviewId: string;
  reviewUpdatedAt: string;
  proposal: Record<string, unknown>;
  evidence: Record<string, unknown>;
}

export default function PrometheusWatchPanel({ athleteId, viewer, hasActiveRelationship, showHeader = true }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { canReadAthleteWatch, canCorrectAthleteWatchContext, canDecideAthleteWatchProposal } = useResourcePermissions();
  const resource = {
    athleteId,
    hasActiveRelationship: athleteId === user?.id ? undefined : hasActiveRelationship,
  };
  const allowed = canReadAthleteWatch(resource);
  const canCorrect = canCorrectAthleteWatchContext(resource);
  const canDecide = canDecideAthleteWatchProposal(resource);
  const [load, setLoad] = useState<WatchLoadState>({ phase: 'loading' });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!allowed || !athleteId) return;
    let cancelled = false;
    setLoad({ phase: 'loading' });
    void Promise.all([
      listAthleteSignalsForWatch(athleteId),
      listLatestAthleteDecisionsForWatch(athleteId),
      listLatestAthleteWeeklyReviewForWatch(athleteId),
    ]).then(([signals, decisions, review]) => {
      if (cancelled) return;
      if (!signals.ok || !decisions.ok || !review.ok) {
        setLoad({ phase: 'error' });
        return;
      }
      setLoad({
        phase: 'ready',
        signals: signals.data,
        decisions: decisions.data,
        review: review.data,
      });
    }).catch(() => {
      if (!cancelled) setLoad({ phase: 'error' });
    });
    return () => {
      cancelled = true;
    };
  }, [allowed, athleteId, retry]);

  const items = useMemo(
    () => (load.phase === 'ready'
      ? buildPrometheusWatchItems({
        signals: load.signals,
        decisions: load.decisions,
        latestReview: load.review,
      })
      : []),
    [load],
  );

  if (!allowed) return null;

  return (
    <div data-testid="prometheus-watch">
      <Card className="mb-4">
        {showHeader && (
        <div className="flex items-start gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
            <Eye size={15} className="text-blue-300" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{t('prometheusWatch.title')}</p>
            <p className="text-[11px] text-neutral-500">{t('prometheusWatch.subtitle')}</p>
          </div>
        </div>
        )}

        {load.phase === 'loading' ? (
          <p className="text-sm text-neutral-400">
            {t(viewer === 'coach' ? 'prometheusWatch.loadingCoach' : 'prometheusWatch.loading')}
          </p>
        ) : load.phase === 'error' ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-rose-300">
              {t(viewer === 'coach' ? 'prometheusWatch.loadErrorCoach' : 'prometheusWatch.loadError')}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRetry((n) => n + 1)}
            >
              {t('errors.retry')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-neutral-400">
            {t(viewer === 'coach' ? 'prometheusWatch.emptyCoach' : 'prometheusWatch.empty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <WatchRow
                key={item.id}
                item={item}
                viewer={viewer}
                canCorrect={canCorrect}
                canDecide={canDecide}
                onReloaded={() => setRetry((n) => n + 1)}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function WatchRow({
  item,
  viewer,
  canCorrect,
  canDecide,
  onReloaded,
}: {
  item: PrometheusWatchItem;
  viewer: 'self' | 'coach';
  canCorrect: boolean;
  canDecide: boolean;
  onReloaded: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState<CorrectionDraft | null>(null);
  const [decisionDraft, setDecisionDraft] = useState<DecisionDraft | null>(null);
  const period = item.periodStart && item.periodEnd
    ? `${formatDate(item.periodStart, i18n.language)} – ${formatDate(item.periodEnd, i18n.language)}`
    : null;
  const lastPeriod = item.lastPeriodStart && item.lastPeriodEnd
    ? `${formatDate(item.lastPeriodStart, i18n.language)} – ${formatDate(item.lastPeriodEnd, i18n.language)}`
    : null;
  const observed = item.observedCopy
    ? t(item.observedCopy.key, item.observedCopy.params)
    : null;
  const actorLabel = item.lastActorKey === 'prometheusWatch.actor.athlete' && viewer === 'self'
    ? t('prometheusWatch.actor.self')
    : item.lastActorKey
      ? t(item.lastActorKey)
      : null;
  const showCorrection = canCorrect && item.kind === 'current';
  const showDecide = canDecide
    && item.kind === 'current'
    && !!item.currentProposalKey
    && !!item.reviewWeekStart
    && !!item.reviewId
    && isWatchProposalReviewId(item.reviewId)
    && !!item.reviewUpdatedAt
    && !!item.currentProposal;

  return (
    <li>
      <details className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-1">
        <summary className="cursor-pointer min-h-11 flex items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-xs uppercase tracking-wide text-neutral-400">
              {t(item.domainKey)} · {t(item.statusKey)}
            </span>
            <span className="block text-sm text-white truncate">{t(item.headlineKey)}</span>
          </span>
          <span className="text-xs text-blue-300 shrink-0">{t('prometheusWatch.more')}</span>
        </summary>
        <dl className="pb-3 pt-1 space-y-2 text-sm">
          <WatchField label={t('prometheusWatch.why')} value={t(item.whyKey)} />
          <WatchField
            label={t('prometheusWatch.proposal.label')}
            value={item.currentProposalKey ? t(item.currentProposalKey) : t('prometheusWatch.proposal.none')}
          />
          {item.currentProposalDetail ? (
            <WatchField
              label={t('prometheusWatch.proposal.detail')}
              value={t(item.currentProposalDetail.key, item.currentProposalDetail.params)}
            />
          ) : null}
        </dl>
        {showDecide ? (
          <div className="pb-3 flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              size="sm"
              pressOnly
              onClick={() => setDecisionDraft({
                signalId: item.id,
                headlineKey: item.headlineKey,
                proposalKey: item.currentProposalKey ?? '',
                proposalDetail: item.currentProposalDetail,
                decision: 'accepted',
                weekStart: item.reviewWeekStart ?? '',
                reviewId: item.reviewId ?? '',
                reviewUpdatedAt: item.reviewUpdatedAt ?? '',
                proposal: item.currentProposal ?? {},
                evidence: item.currentEvidence ?? {},
              })}
            >
              {t('prometheusWatch.decide.accept')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              pressOnly
              onClick={() => setDecisionDraft({
                signalId: item.id,
                headlineKey: item.headlineKey,
                proposalKey: item.currentProposalKey ?? '',
                proposalDetail: item.currentProposalDetail,
                decision: 'modified',
                weekStart: item.reviewWeekStart ?? '',
                reviewId: item.reviewId ?? '',
                reviewUpdatedAt: item.reviewUpdatedAt ?? '',
                proposal: item.currentProposal ?? {},
                evidence: item.currentEvidence ?? {},
              })}
            >
              {t('prometheusWatch.decide.modify')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              pressOnly
              onClick={() => setDecisionDraft({
                signalId: item.id,
                headlineKey: item.headlineKey,
                proposalKey: item.currentProposalKey ?? '',
                proposalDetail: item.currentProposalDetail,
                decision: 'refused',
                weekStart: item.reviewWeekStart ?? '',
                reviewId: item.reviewId ?? '',
                reviewUpdatedAt: item.reviewUpdatedAt ?? '',
                proposal: item.currentProposal ?? {},
                evidence: item.currentEvidence ?? {},
              })}
            >
              {t('prometheusWatch.decide.refuse')}
            </Button>
          </div>
        ) : null}
        <details className="pb-3">
          <summary className="min-h-11 cursor-pointer text-sm text-neutral-300">{t('prometheusWatch.evidence')}</summary>
        <dl className="pb-3 pt-1 space-y-2 text-sm">
          {observed ? (
            <WatchField label={t('prometheusWatch.observed')} value={observed} />
          ) : null}
          {item.dataPoints.length > 0 ? (
            <WatchField
              label={t('prometheusWatch.data.label')}
              value={item.dataPoints.map((row) => t(row.key, row.params)).join(' · ')}
            />
          ) : null}
          {period ? <WatchField label={t('prometheusWatch.period')} value={period} /> : null}
          {item.lastDataPoints.length > 0 ? (
            <WatchField
              label={t('prometheusWatch.lastData')}
              value={item.lastDataPoints.map((row) => t(row.key, row.params)).join(' · ')}
            />
          ) : null}
          {lastPeriod ? <WatchField label={t('prometheusWatch.lastPeriod')} value={lastPeriod} /> : null}
          <WatchField label={t('prometheusWatch.certainty')} value={t(item.confidenceKey)} />
          <WatchField label={t('prometheusWatch.evolution.label')} value={t(item.evolutionKey)} />
          {item.lastProposalKey ? (
            <WatchField label={t('prometheusWatch.proposal.last')} value={t(item.lastProposalKey)} />
          ) : null}
          {item.lastDecisionKey ? (
            <WatchField
              label={t('prometheusWatch.lastDecision')}
              value={`${t(item.lastDecisionKey)}${actorLabel ? ` ${actorLabel}` : ''}`}
            />
          ) : null}
          {item.humanReason ? (
            <WatchField label={t('prometheusWatch.humanReason')} value={item.humanReason} />
          ) : null}
          {item.whyHiddenKey ? (
            <WatchField label={t('prometheusWatch.more')} value={t(item.whyHiddenKey)} />
          ) : null}
          <WatchField label={t('prometheusWatch.reevaluate.label')} value={t(item.reevaluateKey)} />
        </dl>
        {showCorrection ? (
          <div className="pb-3 flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              pressOnly
              onClick={() => setDraft({
                signalId: item.id,
                headlineKey: item.headlineKey,
                action: 'not_relevant',
                seenUpdatedAt: item.signalUpdatedAt ?? '',
                seenEvidence: item.signalEvidence ?? {},
              })}
            >
              {t('prometheusWatch.correct.notRelevant')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              pressOnly
              onClick={() => setDraft({
                signalId: item.id,
                headlineKey: item.headlineKey,
                action: 'corrected',
                seenUpdatedAt: item.signalUpdatedAt ?? '',
                seenEvidence: item.signalEvidence ?? {},
              })}
            >
              {t('prometheusWatch.correct.incorrect')}
            </Button>
          </div>
        ) : null}
        </details>
      </details>
      {draft ? (
        <WatchCorrectionModal
          draft={draft}
          onClose={() => setDraft(null)}
          onPersisted={() => {
            setDraft(null);
            onReloaded();
          }}
        />
      ) : null}
      {decisionDraft ? (
        <WatchDecisionModal
          draft={decisionDraft}
          onClose={() => setDecisionDraft(null)}
          onPersisted={() => {
            setDecisionDraft(null);
            onReloaded();
          }}
        />
      ) : null}
    </li>
  );
}

function WatchCorrectionModal({
  draft,
  onClose,
  onPersisted,
}: {
  draft: CorrectionDraft;
  onClose: () => void;
  onPersisted: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const reasonId = `watch-correction-reason-${draft.signalId}`;
  const trimmed = reason.trim();
  const invalid = trimmed.length < 1 || trimmed.length > 500;

  async function submit() {
    if (invalid || saving) return;
    setSaving(true);
    setError(false);
    const result = await correctAthleteWatchContext({
      signalId: draft.signalId,
      action: draft.action,
      humanReason: trimmed,
      seenUpdatedAt: draft.seenUpdatedAt,
      seenEvidence: draft.seenEvidence,
    });
    setSaving(false);
    if (!result.ok) {
      setError(true);
      return;
    }
    onPersisted();
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!saving) onClose();
      }}
      title={t(
        draft.action === 'not_relevant'
          ? 'prometheusWatch.correct.titleNotRelevant'
          : 'prometheusWatch.correct.titleIncorrect',
      )}
      size="sm"
    >
      <p className="text-sm text-neutral-300 mb-3">
        {t(draft.headlineKey)}
      </p>
      <p className="text-[12px] text-neutral-500 mb-3">
        {t('prometheusWatch.correct.notice')}
      </p>
      <label htmlFor={reasonId} className="block text-sm font-medium text-neutral-300 mb-1.5">
        {t('prometheusWatch.correct.reasonLabel')}
      </label>
      <textarea
        id={reasonId}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
        rows={4}
        required
        disabled={saving}
        className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-2.5 text-white
          placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400
          min-h-24"
      />
      <p className="text-[11px] text-neutral-500 mt-1 mb-4">
        {t('prometheusWatch.correct.reasonHelp')}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-rose-300 mb-3">
          {t('prometheusWatch.correct.error')}
        </p>
      ) : null}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={saving}
          disabled={invalid || saving}
          onClick={() => void submit()}
        >
          {t('prometheusWatch.correct.confirm')}
        </Button>
      </div>
    </Modal>
  );
}

function WatchDecisionModal({
  draft,
  onClose,
  onPersisted,
}: {
  draft: DecisionDraft;
  onClose: () => void;
  onPersisted: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const reasonId = `watch-proposal-reason-${draft.signalId}`;
  const trimmed = reason.trim();
  const required = watchProposalReasonRequired(draft.decision);
  const invalid = trimmed.length > 500 || (required && trimmed.length < 1);

  async function submit() {
    if (invalid || saving) return;
    setSaving(true);
    setError(false);
    const result = await decideAthleteWatchProposal({
      signalId: draft.signalId,
      decision: draft.decision,
      humanReason: trimmed,
      weekStart: draft.weekStart,
      reviewId: draft.reviewId,
      reviewUpdatedAt: draft.reviewUpdatedAt,
      proposal: draft.proposal,
      evidence: draft.evidence,
    });
    setSaving(false);
    if (!result.ok) {
      setError(true);
      return;
    }
    onPersisted();
  }

  const titleKey = draft.decision === 'accepted'
    ? 'prometheusWatch.decide.titleAccept'
    : draft.decision === 'modified'
      ? 'prometheusWatch.decide.titleModify'
      : 'prometheusWatch.decide.titleRefuse';

  return (
    <Modal
      open
      onClose={() => {
        if (!saving) onClose();
      }}
      title={t(titleKey)}
      size="sm"
    >
      <p className="text-sm text-neutral-300 mb-2">
        {t(draft.headlineKey)}
      </p>
      {draft.proposalKey ? (
        <p className="text-sm text-white mb-2">{t(draft.proposalKey)}</p>
      ) : null}
      {draft.proposalDetail ? (
        <p className="text-sm text-neutral-300 mb-3">
          {t(draft.proposalDetail.key, draft.proposalDetail.params)}
        </p>
      ) : null}
      <p className="text-[12px] text-neutral-500 mb-3">
        {t('prometheusWatch.decide.notice')}
      </p>
      <label htmlFor={reasonId} className="block text-sm font-medium text-neutral-300 mb-1.5">
        {t('prometheusWatch.decide.reasonLabel')}
      </label>
      <textarea
        id={reasonId}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
        rows={4}
        required={required}
        disabled={saving}
        className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-2.5 text-white
          placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400
          min-h-24"
      />
      <p className="text-[11px] text-neutral-500 mt-1 mb-4">
        {t(required ? 'prometheusWatch.decide.reasonHelpRequired' : 'prometheusWatch.decide.reasonHelpAccept')}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-rose-300 mb-3">
          {t('prometheusWatch.decide.error')}
        </p>
      ) : null}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={saving}
          disabled={invalid || saving}
          onClick={() => void submit()}
        >
          {t('prometheusWatch.decide.confirm')}
        </Button>
      </div>
    </Modal>
  );
}

function WatchField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="text-neutral-200">{value}</dd>
    </div>
  );
}
