import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useResourcePermissions } from '../../lib/useResourcePermissions';
import { listAthleteSignalsForWatch } from '../../features/signals/domain/athleteSignalsApi';
import { listLatestAthleteDecisionsForWatch } from '../../features/signals/domain/decisionLogApi';
import { listLatestAthleteWeeklyReviewForWatch } from '../../features/signals/domain/weeklyReviewApi';
import {
  buildPrometheusWatchItems,
  type PrometheusWatchItem,
} from '../../features/signals/domain/explainability';
import type { AthleteDecisionLog, AthleteSignal, AthleteWeeklyReview } from '../../lib/types';
import { formatDate } from '../../lib/utils';
import Button from '../ui/Button';
import Card from '../ui/Card';

interface Props {
  athleteId: string;
  viewer: 'self' | 'coach';
  hasActiveRelationship?: boolean;
}

type WatchLoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; signals: AthleteSignal[]; decisions: AthleteDecisionLog[]; review: AthleteWeeklyReview | null }
  | { phase: 'error' };

export default function PrometheusWatchPanel({ athleteId, viewer, hasActiveRelationship }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { canReadAthleteWatch } = useResourcePermissions();
  const allowed = canReadAthleteWatch({
    athleteId,
    hasActiveRelationship: athleteId === user?.id ? undefined : hasActiveRelationship,
  });
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
        <div className="flex items-start gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
            <Eye size={15} className="text-blue-300" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{t('prometheusWatch.title')}</p>
            <p className="text-[11px] text-neutral-500">{t('prometheusWatch.subtitle')}</p>
          </div>
        </div>

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
              <WatchRow key={item.id} item={item} viewer={viewer} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function WatchRow({ item, viewer }: { item: PrometheusWatchItem; viewer: 'self' | 'coach' }) {
  const { t, i18n } = useTranslation();
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

  return (
    <li>
      <details className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-1">
        <summary className="cursor-pointer min-h-11 flex items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-[10px] uppercase tracking-wide text-neutral-500">
              {t(item.domainKey)} · {t(item.statusKey)}
            </span>
            <span className="block text-sm text-white truncate">{t(item.headlineKey)}</span>
          </span>
          <span className="text-[11px] text-blue-300 shrink-0">{t('prometheusWatch.more')}</span>
        </summary>
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
          <WatchField label={t('prometheusWatch.why')} value={t(item.whyKey)} />
          <WatchField label={t('prometheusWatch.certainty')} value={t(item.confidenceKey)} />
          <WatchField label={t('prometheusWatch.evolution.label')} value={t(item.evolutionKey)} />
          <WatchField
            label={t('prometheusWatch.proposal.label')}
            value={item.currentProposalKey ? t(item.currentProposalKey) : t('prometheusWatch.proposal.none')}
          />
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
      </details>
    </li>
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
