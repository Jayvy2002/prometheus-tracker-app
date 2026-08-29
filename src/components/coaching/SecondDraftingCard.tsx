import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { CoachIntervention } from '../../lib/types';
import { interventionDraftError } from '../../lib/coachSecond';
import Button from '../ui/Button';
import Card from '../ui/Card';

export default function SecondDraftingCard({
  row,
  onRetry,
  retrying,
}: {
  row?: CoachIntervention | null;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { t } = useTranslation();
  const error = row ? interventionDraftError(row) : null;
  if (error) {
    return (
      <Card className="mb-4 border-amber-500/20 space-y-2">
        <p className="text-sm font-medium text-amber-200">{t('coaching.second.failed')}</p>
        {onRetry && (
          <Button size="sm" variant="secondary" loading={retrying} onClick={onRetry}>
            {t('coaching.second.retry')}
          </Button>
        )}
      </Card>
    );
  }
  return (
    <Card className="mb-4 border-blue-500/20">
      <p className="text-sm font-medium text-blue-200 flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" />
        {t('coaching.second.drafting')}
      </p>
      <p className="text-xs text-neutral-500 mt-1">{t('coaching.second.draftingHint')}</p>
    </Card>
  );
}
