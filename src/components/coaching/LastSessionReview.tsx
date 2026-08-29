import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { useCoachingStore } from '../../stores/coachingStore';
import {
  interventionDraftError,
  isInterventionDrafting,
  isInterventionReady,
  pendingForClient,
} from '../../lib/coachSecond';
import { interventionHref } from '../../lib/coachInterventions';
import { sessionContextPayload, sessionExerciseLines } from '../../lib/coachLastSession';
import { displayName } from '../../lib/coachText';
import { formatDate } from '../../lib/utils';
import type { CoachClientSummary, LastSessionView } from '../../lib/types';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';
import SecondDraftingCard from './SecondDraftingCard';
import SessionReadout from '../workout/SessionReadout';

export default function LastSessionReview({
  clientId,
  client,
  session,
  relanceHref,
  showRelance,
  onExercise,
}: {
  clientId: string;
  client: CoachClientSummary | undefined;
  session: LastSessionView;
  relanceHref: string;
  showRelance: boolean;
  onExercise?: (name: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const askSecond = useCoachingStore(s => s.askSecond);
  const pendingInterventions = useCoachingStore(s => s.pendingInterventions);
  const [asking, setAsking] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const live = (jobId ? pendingInterventions.find(r => r.id === jobId) : null)
    ?? pendingForClient(pendingInterventions, clientId, 'program_nl_edit');
  const name = client ? displayName(client) : t('coaching.unnamed');

  const askAdjust = async () => {
    setAsking(true);
    const lifts = sessionExerciseLines(session).join('\n') || '—';
    const result = await askSecond({
      kind: 'program_nl_edit',
      clientId,
      prompt: t('coaching.lastSession.askAdjustPrompt', {
        name,
        session: session.name || t('workout.title'),
        date: session.date,
        lifts,
      }),
      screen: 'last_session',
      context: sessionContextPayload(session),
    });
    setAsking(false);
    if ('error' in result) {
      toast(t('coaching.second.failed'), 'error');
      return;
    }
    setJobId(result.id);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-blue-300">{t('coaching.lastSession.title')}</p>
        <h2 className="text-lg font-semibold text-white">{session.name || t('workout.title')}</h2>
        <p className="text-xs text-neutral-500">{formatDate(session.date)}</p>
      </div>

      <SessionReadout session={session} onExercise={onExercise} />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" loading={asking} onClick={() => { void askAdjust(); }}>
          <Sparkles size={14} /> {t('coaching.lastSession.askAdjust')}
        </Button>
        {showRelance && (
          <Button size="sm" variant="ghost" onClick={() => navigate(relanceHref)}>
            {t('coaching.lastSession.relanceIfNeeded')}
          </Button>
        )}
      </div>
      <p className="text-[11px] text-neutral-600">{t('coaching.lastSession.askAdjustHint')}</p>

      {live && (isInterventionDrafting(live) || interventionDraftError(live)) && (
        <SecondDraftingCard
          row={live}
          retrying={asking}
          onRetry={interventionDraftError(live) ? () => { void askAdjust(); } : undefined}
        />
      )}
      {live && isInterventionReady(live) && (
        <Button size="sm" onClick={() => navigate(interventionHref(live))}>
          {t('coaching.second.landed')}
        </Button>
      )}
    </div>
  );
}
