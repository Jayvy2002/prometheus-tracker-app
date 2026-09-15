import { ClipboardList } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAccountContext } from '../../lib/useAccountContext';
import { isIncompleteAssignedQuestionnaire } from '../../lib/assignedQuestionnaire';
import Button from '../ui/Button';
import ListRow from '../ui/ListRow';
import { useAssignedQuestionnaire } from './assignedQuestionnaireContext';

/** Reminder, not a lock: the rest of the app stays reachable. Hidden on the hub itself. */
export default function AssignedQuestionnaireBanner() {
  const { t } = useTranslation();
  const location = useLocation();
  const context = useAccountContext();
  const { status, response, retry } = useAssignedQuestionnaire();

  if (context.activeWorkspace === 'coaching') return null;
  if (location.pathname === '/questionnaire') return null;

  if (status === 'failed') {
    return (
      <div className="px-4 pt-4" role="alert">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
          <p className="text-sm text-neutral-200">{t('coachQuestionnaire.loadError')}</p>
          <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={retry}>
            {t('errors.retry')}
          </Button>
        </div>
      </div>
    );
  }

  if (!isIncompleteAssignedQuestionnaire(response)) return null;

  return (
    <div className="px-4 pt-4">
      <ListRow
        tone="info"
        to="/questionnaire"
        icon={<ClipboardList size={16} />}
        title={t('coachQuestionnaire.bannerTitle')}
        subtitle={t('coachQuestionnaire.bannerBody')}
      />
    </div>
  );
}
