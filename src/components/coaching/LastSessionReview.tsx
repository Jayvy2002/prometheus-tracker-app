import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { useCoachingStore } from '../../stores/coachingStore';
import { openDraftHref } from '../../lib/coachInterventions';
import { sessionContextPayload, sessionExerciseLines } from '../../lib/coachLastSession';
import { displayName } from '../../lib/coachText';
import { formatDate } from '../../lib/utils';
import type { CoachClientSummary, LastSessionView } from '../../lib/types';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';
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
  const askCoachAgent = useCoachingStore(s => s.askCoachAgent);
  const [asking, setAsking] = useState(false);
  const name = client ? displayName(client) : t('coaching.unnamed');

  const askAdjust = async () => {
    setAsking(true);
    const lifts = sessionExerciseLines(session).join('\n') || '—';
    const result = await askCoachAgent({
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
    if ('error' in result || !result.id) {
      toast(t('coaching.second.failed'), 'error');
      return;
    }
    const href = openDraftHref({ kind: 'program_nl_edit', client_id: clientId, id: result.id });
    if (!href) {
      toast(t('coaching.second.failed'), 'error');
      return;
    }
    navigate(href);
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
    </div>
  );
}
