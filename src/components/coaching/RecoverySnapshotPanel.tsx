import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { useCoachingStore } from '../../stores/coachingStore';
import {
  interventionDraftError,
  isInterventionDrafting,
  isInterventionReady,
  pendingForClient,
} from '../../lib/coachSecond';
import { interventionHref } from '../../lib/coachInterventions';
import {
  canAskRecoveryAdjust,
  recoveryContextPayload,
} from '../../lib/coachRecovery';
import { displayName } from '../../lib/coachText';
import { formatDate } from '../../lib/utils';
import type { CoachClientSummary, RecoverySnapshot } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Sparkline from '../ui/Sparkline';
import { toast } from '../ui/Toast';
import SecondDraftingCard from './SecondDraftingCard';

function Metric({
  label,
  value,
  tone,
  trend,
  trendClass,
}: {
  label: string;
  value: string;
  tone?: string;
  trend: number[];
  trendClass?: string;
}) {
  return (
    <div className="rounded-xl bg-neutral-950/60 px-3 py-2 min-w-0">
      <p className="text-[10px] text-neutral-500 uppercase tracking-wide truncate">{label}</p>
      <p className={`text-sm font-medium mt-0.5 truncate ${tone || 'text-white'}`}>{value}</p>
      {trend.length >= 2 ? (
        <div className="mt-1">
          <Sparkline values={trend} className={trendClass || 'text-blue-400'} />
        </div>
      ) : null}
    </div>
  );
}

export default function RecoverySnapshotPanel({
  clientId,
  client,
  snapshot,
  relanceHref,
}: {
  clientId: string;
  client: CoachClientSummary | undefined;
  snapshot: RecoverySnapshot;
  relanceHref: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const askSecond = useCoachingStore(s => s.askSecond);
  const pendingInterventions = useCoachingStore(s => s.pendingInterventions);
  const [asking, setAsking] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const live = (jobId ? pendingInterventions.find(r => r.id === jobId) : null)
    ?? pendingForClient(pendingInterventions, clientId, 'program_nl_edit');
  const name = client ? displayName(client) : t('coaching.unnamed');
  const canAsk = canAskRecoveryAdjust(snapshot);
  const sleepLabel = snapshot.sleepHours != null
    ? t('coaching.recovery.hours', { n: snapshot.sleepHours })
    : (snapshot.sleepQuality != null ? `${snapshot.sleepQuality}/5` : '—');
  const painLabel = snapshot.pain != null ? `${snapshot.pain}/5` : '—';
  const energyLabel = snapshot.energy != null ? `${snapshot.energy}/5` : '—';
  const sorenessLabel = snapshot.soreness != null ? `${snapshot.soreness}/5` : '—';

  const askAdjust = async () => {
    if (!canAsk) return;
    setAsking(true);
    const result = await askSecond({
      kind: 'program_nl_edit',
      clientId,
      prompt: t('coaching.recovery.askAdjustPrompt', {
        name,
        date: formatDate(snapshot.checkin.checked_at),
        pain: snapshot.pain ?? '—',
        sleep: snapshot.sleepHours ?? snapshot.sleepQuality ?? '—',
        notes: snapshot.notes || '—',
      }),
      screen: 'recovery',
      context: recoveryContextPayload(snapshot),
    });
    setAsking(false);
    if ('error' in result) {
      toast(t('coaching.second.failed'), 'error');
      return;
    }
    setJobId(result.id);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-rose-300">{t('coaching.recovery.title')}</p>
        <h2 className="text-lg font-semibold text-white">{t('coaching.recovery.latest')}</h2>
        <p className="text-xs text-neutral-500">{formatDate(snapshot.checkin.checked_at)}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric
          label={t('coaching.recovery.sleep')}
          value={sleepLabel}
          trend={snapshot.trend.sleepHours}
        />
        <Metric
          label={t('coaching.recovery.pain')}
          value={painLabel}
          tone={(snapshot.pain ?? 0) >= 3 ? 'text-rose-300' : undefined}
          trend={snapshot.trend.pain}
          trendClass="text-rose-400"
        />
        <Metric
          label={t('coaching.recovery.energy')}
          value={energyLabel}
          trend={snapshot.trend.energy}
          trendClass="text-emerald-400"
        />
        <Metric
          label={t('coaching.recovery.soreness')}
          value={sorenessLabel}
          trend={[]}
        />
      </div>
      <p className="text-[11px] text-neutral-600">{t('coaching.recovery.trendHint')}</p>

      {snapshot.notes ? (
        <Card>
          <p className="text-xs text-neutral-300">
            <span className="text-neutral-500">{t('coaching.checkinReview.clientNote')} </span>
            {snapshot.notes}
          </p>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => navigate(relanceHref)}>
          {t('coaching.queue.relance')}
        </Button>
        {canAsk && (
          <Button size="sm" variant="secondary" loading={asking} onClick={() => { void askAdjust(); }}>
            <Sparkles size={14} /> {t('coaching.recovery.askAdjust')}
          </Button>
        )}
      </div>
      <p className="text-[11px] text-neutral-600">
        {canAsk ? t('coaching.recovery.askAdjustHint') : t('coaching.recovery.relanceHint')}
      </p>

      {live && (isInterventionDrafting(live) || interventionDraftError(live)) && (
        <SecondDraftingCard
          row={live}
          retrying={asking}
          onRetry={interventionDraftError(live) && canAsk ? () => { void askAdjust(); } : undefined}
        />
      )}
      {live && isInterventionReady(live) && (
        <Button size="sm" onClick={() => navigate(interventionHref(live))}>
          {t('coaching.second.landed')}
        </Button>
      )}
    </div>
  );
}
