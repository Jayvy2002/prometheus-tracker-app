import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import type { ClientLiftProgress } from '../../lib/types';
import { useCoachingStore } from '../../stores/coachingStore';
import { liftChartPoints } from '../../lib/coachProgress';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { toast } from '../ui/Toast';
import { LiftLineChart } from './ProgressCharts';
import SecondDraftingCard from './SecondDraftingCard';
import { interventionDraftError, isInterventionDrafting, isInterventionReady } from '../../lib/coachSecond';
import { interventionHref } from '../../lib/coachInterventions';

type CopilotAction = 'maintain' | 'reduce_volume' | 'change_rep_range' | 'replace_exercise';

export default function ExerciseWorkspace({
  clientId,
  lift,
  onClose,
  onAsk,
}: {
  clientId: string;
  lift: ClientLiftProgress;
  onClose: () => void;
  onAsk: (q: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const askSecond = useCoachingStore(s => s.askSecond);
  const pendingInterventions = useCoachingStore(s => s.pendingInterventions);
  const [saving, setSaving] = useState<CopilotAction | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<CopilotAction>('maintain');

  const sessions = lift.sessions.slice(0, 6);
  const last = sessions[0];
  const freq = new Set(sessions.map(s => s.date)).size;
  const reasons: string[] = [];
  if (lift.stalled) reasons.push(t('coaching.workspace.reasons.flatLoad'));
  if (last?.avgRir != null && last.avgRir >= 3) reasons.push(t('coaching.workspace.reasons.easyRir'));
  if (freq <= 2 && sessions.length >= 2) reasons.push(t('coaching.workspace.reasons.lowFreq'));
  if (reasons.length === 0) reasons.push(t('coaching.workspace.reasons.none'));

  const live = pendingInterventions.find(r => r.id === jobId) ?? null;

  const propose = async (action: CopilotAction) => {
    setSaving(action);
    setLastAction(action);
    const result = await askSecond({
      kind: 'program_nl_edit',
      clientId,
      prompt: t(`coaching.workspace.actions.${action}`) + ' — ' + t('coaching.workspace.observation', {
        lift: lift.displayName,
        last: last?.bestSet ?? '—',
        n: sessions.length,
      }),
      screen: 'exercise_workspace',
      context: {
        action,
        lift: lift.displayName,
        last: last?.bestSet ?? '—',
        reasons,
      },
    });
    setSaving(null);
    if ('error' in result) {
      toast(t('coaching.second.failed'), 'error');
      return;
    }
    setJobId(result.id);
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={onClose} className="text-sm text-blue-400">{t('common.back')}</button>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-blue-300">{t('coaching.workspace.title')}</p>
        <h2 className="text-lg font-semibold text-white">{lift.displayName}</h2>
        <p className="text-xs text-neutral-500">
          {t('coaching.workspace.meta', { n: sessions.length, freq })}
        </p>
      </div>

      {liftChartPoints(lift).length > 1 && (
        <Card>
          <LiftLineChart points={liftChartPoints(lift)} />
        </Card>
      )}

      <div className="space-y-2">
        {sessions.map(s => (
          <Card key={`${s.workoutId}-${s.date}`} className="!p-3">
            <p className="text-xs text-neutral-500">{s.date} · {s.workoutName}</p>
            <p className="text-sm text-white mt-1">{s.bestSet}{s.avgRir != null ? ` · RIR ${s.avgRir}` : ''}</p>
            <div className="mt-1 space-y-0.5">
              {s.sets.filter(set => set.completed || set.weight_kg > 0).map((set, i) => (
                <p key={i} className="text-[11px] text-neutral-400">
                  {i + 1}. {set.weight_kg}kg × {set.reps}{set.rir ? ` @ RIR ${set.rir}` : ''}
                </p>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card className="space-y-3">
        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest flex items-center gap-1">
          <Sparkles size={12} className="text-blue-400" /> {t('coaching.workspace.copilot')}
        </p>
        <div>
          <p className="text-[11px] text-neutral-500 mb-1">{t('coaching.workspace.observationLabel')}</p>
          <p className="text-sm text-neutral-200">
            {t('coaching.workspace.observation', {
              lift: lift.displayName,
              last: last?.bestSet ?? '—',
              n: sessions.length,
            })}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-neutral-500 mb-1">{t('coaching.workspace.reasonsLabel')}</p>
          <ul className="text-sm text-neutral-300 list-disc pl-4 space-y-0.5">
            {reasons.map(r => <li key={r}>{r}</li>)}
          </ul>
        </div>
        <div>
          <p className="text-[11px] text-neutral-500 mb-2">{t('coaching.workspace.actionsLabel')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(['maintain', 'reduce_volume', 'change_rep_range', 'replace_exercise'] as CopilotAction[]).map(action => (
              <Button
                key={action}
                size="sm"
                variant="secondary"
                loading={saving === action}
                onClick={() => propose(action)}
              >
                {t(`coaching.workspace.actions.${action}`)}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-neutral-600 mt-2">{t('coaching.workspace.proposalHint')}</p>
        </div>
        {live && (isInterventionDrafting(live) || interventionDraftError(live)) && (
          <SecondDraftingCard
            row={live}
            retrying={saving !== null}
            onRetry={interventionDraftError(live) ? () => void propose(lastAction) : undefined}
          />
        )}
        {live && isInterventionReady(live) && (
          <Button type="button" size="sm" onClick={() => navigate(interventionHref(live))}>
            {t('coaching.ask.openDraft')}
          </Button>
        )}
        <button
          type="button"
          className="text-xs text-blue-400"
          onClick={() => onAsk(t('coaching.ask.liftPrompt', { lift: lift.displayName }))}
        >
          {t('coaching.workspace.ask')}
        </button>
      </Card>
    </div>
  );
}
