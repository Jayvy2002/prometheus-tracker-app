import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import type { SoloAskProposal } from '../../lib/soloAsk';
import { proposeSoloAsk, type SoloAskContext } from '../../lib/soloAsk';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface Props {
  context: Omit<SoloAskContext, 'question'>;
  onApplyOnce: (proposal: SoloAskProposal) => Promise<void> | void;
  onSave: (proposal: SoloAskProposal) => Promise<void> | void;
}

export default function SoloAskBar({ context, onApplyOnce, onSave }: Props) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [proposal, setProposal] = useState<SoloAskProposal | null>(null);
  const [dayName, setDayName] = useState('');
  const [busy, setBusy] = useState(false);

  const run = () => {
    const next = proposeSoloAsk({ ...context, question });
    setProposal(next);
    setDayName(next?.dayName ?? '');
  };

  const finish = () => {
    setProposal(null);
    setQuestion('');
  };

  return (
    <div className="mb-4 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-3" data-solo-ask="true">
      <label className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-neutral-500">
        <Sparkles size={12} className="text-blue-400" />
        {t('soloAsk.label')}
      </label>
      <div className="flex gap-2">
        <Input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') run(); }}
          placeholder={t(`soloAsk.placeholder.${context.surface}`, { defaultValue: t('soloAsk.placeholder.workout') })}
        />
        <Button type="button" size="sm" onClick={run} disabled={!question.trim()}>
          {t('soloAsk.ask')}
        </Button>
      </div>
      {proposal && (
        <div className="mt-3 space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3" data-solo-ask-review="true">
          <p className="text-sm font-medium text-white">{t(proposal.titleKey, proposal.params)}</p>
          <p className="text-sm text-neutral-300">{t(proposal.bodyKey, proposal.params)}</p>
          {proposal.exercises.length > 0 && (
            <ul className="space-y-1 text-xs text-neutral-400">
              {proposal.exercises.map(ex => (
                <li key={ex.name}>{ex.default_sets}×{ex.default_reps} {ex.name}</li>
              ))}
            </ul>
          )}
          {proposal.recipe && (
            <p className="text-xs text-neutral-400">
              {proposal.recipe.calories} kcal · P {proposal.recipe.protein} / C {proposal.recipe.carbs} / F {proposal.recipe.fat}
            </p>
          )}
          {proposal.actions.includes('save') && proposal.kind === 'workout_adjust' && (
            <Input
              value={dayName}
              onChange={e => setDayName(e.target.value)}
              placeholder={t('soloAsk.namedDay')}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={finish}>
              {t('soloAsk.ignore')}
            </Button>
            {proposal.actions.includes('apply_once') && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onApplyOnce({ ...proposal, dayName: dayName || proposal.dayName });
                  setBusy(false);
                  finish();
                }}
              >
                {t(proposal.applyLabelKey)}
              </Button>
            )}
            {proposal.actions.includes('save') && (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onSave({ ...proposal, dayName: dayName || proposal.dayName });
                  setBusy(false);
                  finish();
                }}
              >
                {t(proposal.saveLabelKey)}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
