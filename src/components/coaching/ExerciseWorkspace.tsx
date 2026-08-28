import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import type { ClientLiftProgress } from '../../lib/types';
import { useCoachingStore } from '../../stores/coachingStore';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { toast } from '../ui/Toast';

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
  const createIntervention = useCoachingStore(s => s.createIntervention);
  const [saving, setSaving] = useState<CopilotAction | null>(null);

  const sessions = lift.sessions.slice(0, 6);
  const last = sessions[0];
  const freq = new Set(sessions.map(s => s.date)).size;
  const reasons: string[] = [];
  if (lift.stalled) reasons.push(t('coaching.workspace.reasons.flatLoad'));
  if (last?.avgRir != null && last.avgRir >= 3) reasons.push(t('coaching.workspace.reasons.easyRir'));
  if (freq <= 2 && sessions.length >= 2) reasons.push(t('coaching.workspace.reasons.lowFreq'));
  if (reasons.length === 0) reasons.push(t('coaching.workspace.reasons.none'));

  const propose = async (action: CopilotAction) => {
    setSaving(action);
    const sets = action === 'reduce_volume' ? Math.max(1, 2) : undefined;
    const result = await createIntervention({
      clientId,
      kind: 'program_adjustment',
      title: t(`coaching.workspace.actions.${action}`),
      rationale: t('coaching.workspace.observation', {
        lift: lift.displayName,
        last: last?.bestSet ?? '—',
        n: sessions.length,
      }),
      payload: {
        observation: t('coaching.workspace.observation', {
          lift: lift.displayName,
          last: last?.bestSet ?? '—',
          n: sessions.length,
        }),
        reasons,
        action,
        patch: {
          exercise: lift.displayName,
          default_sets: sets,
          default_reps: action === 'change_rep_range' ? 10 : undefined,
          default_reps_min: action === 'change_rep_range' ? 6 : undefined,
        },
      },
      source: 'prometheus_local',
    });
    setSaving(null);
    if ('error' in result) {
      toast(result.error, 'error');
      return;
    }
    toast(t('coaching.workspace.draftCreated'));
    navigate(`/clients/${clientId}/draft/${result.id}`);
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
