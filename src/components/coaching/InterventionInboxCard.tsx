import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Sparkles } from 'lucide-react';
import {
  isCompleteCalorieDraft,
  isCoachOnlyKind,
  interventionHref,
  parseCalorieDraft,
  payloadSummary,
} from '../../lib/coachInterventions';
import {
  isRelanceKind,
  parseFleetCause,
  parseFleetObservation,
  parsePreparedMessage,
} from '../../lib/coachFleet';
import { interventionLiveLabel } from '../../lib/coachSecond';
import type { CoachIntervention } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';

export default function InterventionInboxCard({
  item,
  clientName,
  sending,
  onSend,
}: {
  item: CoachIntervention;
  clientName: string;
  sending?: boolean;
  onSend?: (item: CoachIntervention) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const href = interventionHref(item, { from: 'messages' });
  const observation = parseFleetObservation(item.payload);
  const cause = parseFleetCause(item.payload, item.rationale);
  const message = parsePreparedMessage(item.payload);
  const cals = parseCalorieDraft(item.payload);
  const completeCals = isCompleteCalorieDraft(cals);
  const relance = isRelanceKind(item.kind);
  const primaryIsSend = (relance && !!message && !!onSend)
    || (item.kind === 'calorie_adjustment' && completeCals && !!onSend);

  return (
    <Card className="space-y-2">
      <button type="button" onClick={() => navigate(href)} className="w-full text-left flex items-start gap-3">
        <Sparkles size={16} className={`mt-1 shrink-0 ${isCoachOnlyKind(item.kind) ? 'text-violet-400' : 'text-blue-400'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-blue-300">
            {t(`coaching.interventions.kinds.${item.kind}`)}
          </p>
          <p className="text-sm font-medium text-white truncate">
            {item.title || t(`coaching.interventions.kinds.${item.kind}`)}
          </p>
          <p className="text-[11px] text-neutral-500 truncate">
            {clientName}
            {' · '}
            {interventionLiveLabel(item, t) || payloadSummary(item)}
          </p>
        </div>
        <ChevronRight size={16} className="text-neutral-600 mt-1 shrink-0" />
      </button>
      {observation ? (
        <p className="text-xs text-neutral-300 px-0.5">
          <span className="text-neutral-500">{t('coaching.fleet.observation')} · </span>
          {observation}
        </p>
      ) : null}
      {cause ? (
        <p className="text-xs text-neutral-400 px-0.5">
          <span className="text-neutral-500">{t('coaching.fleet.cause')} · </span>
          {cause}
        </p>
      ) : null}
      {relance && message ? (
        <p className="text-xs text-neutral-200 bg-neutral-900 rounded-lg px-3 py-2 whitespace-pre-wrap">
          {message}
        </p>
      ) : null}
      {item.kind === 'calorie_adjustment' && completeCals && cals ? (
        <p className="text-xs text-neutral-200 bg-neutral-900 rounded-lg px-3 py-2">
          {cals.calories} kcal · P{cals.protein} C{cals.carbs} F{cals.fat}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {primaryIsSend ? (
          <Button size="sm" loading={sending} onClick={() => onSend?.(item)}>
            {relance ? t('coaching.queue.relance') : t('coaching.interventions.send')}
          </Button>
        ) : (
          <Button size="sm" onClick={() => navigate(href)}>
            {item.kind === 'onboarding_plan' ? t('coaching.queue.setup') : t('coaching.interventions.edit')}
          </Button>
        )}
        {primaryIsSend ? (
          <Button size="sm" variant="secondary" onClick={() => navigate(href)}>
            {t('coaching.interventions.edit')}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
