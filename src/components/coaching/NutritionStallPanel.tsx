import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Card from '../ui/Card';
import SecondDraftingCard from './SecondDraftingCard';
import type { CoachIntervention } from '../../lib/types';
import { isInterventionDrafting } from '../../lib/coachSecond';

export default function NutritionStallPanel({
  relanceHref,
  draftHref,
  canAskSecond,
  asking,
  liveDraft,
  onAskSecond,
}: {
  relanceHref: string;
  draftHref: string | null;
  canAskSecond: boolean;
  asking: boolean;
  liveDraft: CoachIntervention | null;
  onAskSecond: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const ask = () => {
    onAskSecond();
  };

  return (
    <Card className="space-y-3">
      <p className="text-[11px] uppercase tracking-wider text-amber-300">
        {t('coaching.nutritionStall.badge')}
      </p>
      <p className="text-sm text-white">{t('coaching.nutritionStall.body')}</p>
      <p className="text-[11px] text-neutral-500">{t('coaching.nutritionStall.hint')}</p>
      {liveDraft && isInterventionDrafting(liveDraft) && (
        <SecondDraftingCard row={liveDraft} retrying={asking} onRetry={ask} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => navigate(relanceHref)}>
          {t('coaching.queue.relance')}
        </Button>
        {draftHref && !(liveDraft && isInterventionDrafting(liveDraft)) && (
          <Button size="sm" variant="secondary" onClick={() => navigate(draftHref)}>
            {t('coaching.nutritionStall.openDraft')}
          </Button>
        )}
        {canAskSecond && !draftHref && (
          <Button size="sm" variant="secondary" loading={asking} onClick={ask}>
            {t('coaching.nutritionStall.askSecond')}
          </Button>
        )}
      </div>
    </Card>
  );
}
