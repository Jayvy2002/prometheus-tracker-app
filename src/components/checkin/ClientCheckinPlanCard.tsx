import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { useCheckinPlan } from '../../features/checkins/hooks/useCheckinPlan';
import { useCheckinTemplates } from '../../features/checkins/hooks/useCheckinTemplates';
import type { CheckinVarKey } from '../../lib/clientTracking';
import CheckinPlanEditor from './CheckinPlanEditor';

/** Client file › Check-ins: what the athlete is asked and how often (the coach decides). */
export default function ClientCheckinPlanCard({
  clientId,
  coachId,
  habits,
}: {
  clientId: string;
  coachId: string;
  habits: CheckinVarKey[];
}) {
  const { t } = useTranslation();
  const { plan, template, reload } = useCheckinPlan(clientId);
  const { templates } = useCheckinTemplates(coachId);
  const [editing, setEditing] = useState(false);

  return (
    <Card data-testid="client-checkin-plan">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{t('checkinPlan.clientTitle')}</p>
          <p className="text-xs text-neutral-400 mt-0.5">
            {t(`checkinPlan.frequencies.${plan?.frequency ?? 'daily'}`)}
            {template ? ` · ${template.name}` : ` · ${t('checkinPlan.noTemplate')}`}
          </p>
        </div>
        {!editing && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>{t('common.edit')}</Button>}
      </div>
      {editing && (
        <div className="mt-4 space-y-3">
          <CheckinPlanEditor
            userId={clientId}
            plan={plan}
            templates={templates}
            habits={habits}
            onSaved={() => { setEditing(false); void reload(); }}
          />
          <Link to="/coach/checkins" className="inline-block min-h-11 text-xs text-blue-400">{t('checkinPlan.manageTemplates')}</Link>
        </div>
      )}
    </Card>
  );
}
