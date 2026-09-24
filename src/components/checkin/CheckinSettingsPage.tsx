import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useCheckinPlan } from '../../features/checkins/hooks/useCheckinPlan';
import { useCheckinTemplates } from '../../features/checkins/hooks/useCheckinTemplates';
import { setPlan } from '../../features/checkins/api/checkinPlanApi';
import type { CheckinQuestion } from '../../features/checkins/domain/checkinTemplate';
import { useClientTracking } from '../../lib/useClientTracking';
import { visibleCheckinFields } from '../../lib/clientTracking';
import { useAccountContext } from '@/features/account/hooks/useAccountContext';
import PageHeader from '../ui/PageHeader';
import PageTransition from '../ui/PageTransition';
import Card from '../ui/Card';
import Button from '../ui/Button';
import ErrorState from '../ui/ErrorState';
import { PageSkeleton } from '../ui/PageSkeleton';
import { toast } from '../ui/Toast';
import { userFacingError } from '../../lib/userFacingError';
import CheckinPlanEditor from './CheckinPlanEditor';
import CheckinTemplateEditor from './CheckinTemplateEditor';

/**
 * Solo › Check-in settings (Vision §11.2: a default template the Solo can
 * change). A coached athlete sees what the coach chose, read-only.
 */
export default function CheckinSettingsPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const coached = useAccountContext().personalCoaching === 'coached';
  const tracking = useClientTracking();
  const { plan, template, loading, error, reload } = useCheckinPlan(user?.id);
  const templates = useCheckinTemplates(coached ? null : user?.id);
  const [editingQuestions, setEditingQuestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const own = templates.templates[0] ?? null;

  const saveOwn = async (name: string, questions: CheckinQuestion[]) => {
    setSaving(true);
    const result = await templates.save({ id: own?.id ?? null, name, questions });
    setSaving(false);
    if (result.error) {
      toast(userFacingError(result.error, t('checkinPlan.saveFailed')), 'error');
      return;
    }
    // A Solo's own questions are meant to be asked: attach them to the plan right away.
    if (user && result.id && plan?.template_id !== result.id) {
      const attached = await setPlan({
        userId: user.id,
        templateId: result.id,
        frequency: plan?.frequency ?? 'daily',
        weekday: plan?.weekday ?? null,
        habitReasons: plan?.habit_reasons ?? {},
      });
      if (attached.error) {
        toast(userFacingError(attached.error, t('checkinPlan.saveFailed')), 'error');
        return;
      }
      await reload();
    }
    toast(t('checkinPlan.templateSaved'));
    setEditingQuestions(false);
  };

  if (loading && !plan) return <PageSkeleton />;

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28 space-y-4">
        <PageHeader title={t('checkinPlan.settingsTitle')} backTo="/checkin" />
        {error ? (
          <ErrorState title={t('checkinPlan.loadError')} onRetry={() => void reload()} />
        ) : coached ? (
          <Card>
            <p className="text-sm text-neutral-300">{t('checkinPlan.coachDecides')}</p>
            <p className="text-sm text-white mt-2">
              {t(`checkinPlan.frequencies.${plan?.frequency ?? 'daily'}`)}
              {template ? ` · ${template.name}` : ''}
            </p>
          </Card>
        ) : (
          <>
            <Card>
              <CheckinPlanEditor
                userId={user?.id ?? ''}
                plan={plan}
                templates={templates.templates}
                habits={[]}
                onSaved={() => void reload()}
              />
            </Card>
            <Card>
              <p className="text-sm font-semibold text-white mb-1">{t('checkinPlan.myQuestions')}</p>
              <p className="text-xs text-neutral-500 mb-3">{t('checkinPlan.myQuestionsHint', { count: visibleCheckinFields(tracking).length })}</p>
              {editingQuestions ? (
                <CheckinTemplateEditor
                  initialName={own?.name ?? t('checkinPlan.myQuestionsDefaultName')}
                  initialQuestions={own?.questions ?? []}
                  saving={saving}
                  onSave={(name, questions) => void saveOwn(name, questions)}
                  onCancel={() => setEditingQuestions(false)}
                />
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setEditingQuestions(true)}>
                  {own ? t('checkinPlan.editMyQuestions', { count: own.questions.length }) : t('checkinPlan.addMyQuestions')}
                </Button>
              )}
            </Card>
          </>
        )}
      </div>
    </PageTransition>
  );
}
