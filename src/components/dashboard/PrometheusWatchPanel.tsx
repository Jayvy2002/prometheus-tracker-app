import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useResourcePermissions } from '../../lib/useResourcePermissions';
import { listAthleteSignalsForWatchBestEffort } from '../../features/signals/domain/athleteSignalsApi';
import { listLatestAthleteDecisionsBestEffort } from '../../features/signals/domain/decisionLogApi';
import { listLatestAthleteWeeklyReviewBestEffort } from '../../features/signals/domain/weeklyReviewApi';
import {
  buildPrometheusWatchItems,
  type PrometheusWatchItem,
} from '../../features/signals/domain/explainability';
import type { AthleteDecisionLog, AthleteSignal, AthleteWeeklyReview } from '../../lib/types';
import { formatDate } from '../../lib/utils';
import Card from '../ui/Card';

interface Props {
  athleteId: string;
  viewer: 'self' | 'coach';
  hasActiveRelationship?: boolean;
}

export default function PrometheusWatchPanel({ athleteId, viewer, hasActiveRelationship }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { canReadAthleteWatch } = useResourcePermissions();
  const allowed = canReadAthleteWatch({
    athleteId,
    hasActiveRelationship: athleteId === user?.id ? undefined : hasActiveRelationship,
  });
  const [signals, setSignals] = useState<AthleteSignal[] | null>(null);
  const [decisions, setDecisions] = useState<AthleteDecisionLog[] | null>(null);
  const [review, setReview] = useState<AthleteWeeklyReview | null>(null);

  useEffect(() => {
    if (!allowed || !athleteId) return;
    let cancelled = false;
    void Promise.all([
      listAthleteSignalsForWatchBestEffort(athleteId),
      listLatestAthleteDecisionsBestEffort(athleteId),
      listLatestAthleteWeeklyReviewBestEffort(athleteId),
    ]).then(([nextSignals, nextDecisions, nextReview]) => {
      if (cancelled) return;
      setSignals(nextSignals);
      setDecisions(nextDecisions);
      setReview(nextReview);
    });
    return () => {
      cancelled = true;
    };
  }, [allowed, athleteId]);

  const items = useMemo(
    () => (signals && decisions
      ? buildPrometheusWatchItems({ signals, decisions, latestReview: review })
      : []),
    [signals, decisions, review],
  );

  if (!allowed) return null;

  const loading = signals === null || decisions === null;

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

        {loading ? (
          <p className="text-sm text-neutral-400">
            {t(viewer === 'coach' ? 'prometheusWatch.loadingCoach' : 'prometheusWatch.loading')}
          </p>
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
  const { t } = useTranslation();
  const period = item.periodStart && item.periodEnd
    ? `${formatDate(item.periodStart)} – ${formatDate(item.periodEnd)}`
    : null;
  const headline = t(item.headlineKey, { defaultValue: item.headlineFallback });
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
            <span className="block text-sm text-white truncate">{headline}</span>
          </span>
          <span className="text-[11px] text-blue-300 shrink-0">{t('prometheusWatch.more')}</span>
        </summary>
        <dl className="pb-3 pt-1 space-y-2 text-sm">
          {item.observed ? (
            <WatchField label={t('prometheusWatch.observed')} value={item.observed} />
          ) : null}
          {item.dataPoints.length > 0 ? (
            <WatchField
              label={t('prometheusWatch.data.label')}
              value={item.dataPoints.map((row) => t(row.key, row.params)).join(' · ')}
            />
          ) : null}
          {period ? <WatchField label={t('prometheusWatch.period')} value={period} /> : null}
          <WatchField label={t('prometheusWatch.why')} value={t(item.whyKey)} />
          <WatchField label={t('prometheusWatch.certainty')} value={t(item.confidenceKey)} />
          <WatchField label={t('prometheusWatch.evolution.label')} value={t(item.evolutionKey)} />
          <WatchField
            label={t('prometheusWatch.proposal.label')}
            value={item.proposalKey ? t(item.proposalKey) : t('prometheusWatch.proposal.none')}
          />
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
