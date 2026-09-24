import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCheckinTemplates } from '../../features/checkins/hooks/useCheckinTemplates';
import type { CheckinQuestion, CheckinTemplate } from '../../features/checkins/domain/checkinTemplate';
import PageHeader from '../ui/PageHeader';
import PageTransition from '../ui/PageTransition';
import Card from '../ui/Card';
import Button from '../ui/Button';
import ErrorState from '../ui/ErrorState';
import EmptyState from '../ui/EmptyState';
import { ListSkeleton } from '../ui/PageSkeleton';
import { toast } from '../ui/Toast';
import { userFacingError } from '../../lib/userFacingError';
import CheckinTemplateEditor from './CheckinTemplateEditor';

/** Coach › Check-in templates (Vision §11.1): build once, assign per client with a rhythm. */
export default function CheckinTemplatesPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const { templates, loading, error, reload, save, remove } = useCheckinTemplates(user?.id);
  const [editing, setEditing] = useState<CheckinTemplate | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  const onSave = async (name: string, questions: CheckinQuestion[]) => {
    setSaving(true);
    const result = await save({ id: editing === 'new' ? null : editing?.id, name, questions });
    setSaving(false);
    if (result.error) {
      toast(userFacingError(result.error, t('checkinPlan.saveFailed')), 'error');
      return;
    }
    toast(t('checkinPlan.templateSaved'));
    setEditing(null);
  };

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28">
        <PageHeader
          title={t('checkinPlan.templatesTitle')}
          subtitle={t('checkinPlan.templatesSubtitle')}
          backTo="/clients"
          actions={!editing ? (
            <Button size="sm" onClick={() => setEditing('new')}><Plus size={16} aria-hidden="true" /> {t('common.new')}</Button>
          ) : undefined}
        />
        {editing ? (
          <Card>
            <CheckinTemplateEditor
              initialName={editing === 'new' ? '' : editing.name}
              initialQuestions={editing === 'new' ? [] : editing.questions}
              saving={saving}
              onSave={(name, questions) => void onSave(name, questions)}
              onCancel={() => setEditing(null)}
            />
          </Card>
        ) : loading && templates.length === 0 ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorState title={t('checkinPlan.loadError')} onRetry={() => void reload()} />
        ) : templates.length === 0 ? (
          <EmptyState title={t('checkinPlan.noTemplates')} body={t('checkinPlan.noTemplatesHint')} />
        ) : (
          <ul className="space-y-2" data-testid="checkin-templates">
            {templates.map(tpl => (
              <li key={tpl.id}>
                <Card className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{tpl.name}</p>
                    <p className="text-xs text-neutral-500">{t('checkinPlan.questionCount', { count: tpl.questions.length })}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(tpl)}>{t('common.edit')}</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void remove(tpl.id).then(r => r.error
                      ? toast(userFacingError(r.error, t('checkinPlan.saveFailed')), 'error')
                      : toast(t('checkinPlan.templateDeleted')))}
                  >
                    {t('common.delete')}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-xs text-neutral-500">{t('checkinPlan.historyKept')}</p>
      </div>
    </PageTransition>
  );
}
