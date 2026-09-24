import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity } from 'lucide-react';
import Button from '../ui/Button';
import ErrorState from '../ui/ErrorState';
import { toast } from '../ui/Toast';
import { useConstraints } from '../../features/constraints/hooks/useConstraints';
import { needsProfessionalAdvice, splitConstraints, type AthleteConstraint } from '../../features/constraints/domain/constraints';
import { formatDate } from '../../lib/utils';
import { userFacingError } from '../../lib/userFacingError';
import DeclareConstraintForm from './DeclareConstraintForm';

/**
 * Vision §7.6 — what the athlete declared: open first, resolved kept below.
 * Shown to the athlete (Profile) and to their active coach (client file).
 */
export default function ConstraintsPanel({ userId, viewer }: { userId: string; viewer: 'athlete' | 'coach' }) {
  const { t, i18n } = useTranslation();
  const { rows, loading, error, busy, reload, setStatus, update } = useConstraints(userId);
  const [declaring, setDeclaring] = useState(false);
  const [advice, setAdvice] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const { open, resolved } = splitConstraints(rows);

  const act = async (op: Promise<{ error: string | null }>) => {
    const result = await op;
    if (result.error) toast(userFacingError(result.error, t('constraints.saveFailed')), 'error');
    else toast(t('constraints.saved'));
  };

  const line = (c: AthleteConstraint) => [
    c.body_area !== 'none' ? t(`constraints.areas.${c.body_area}`) : null,
    c.kind === 'pain' && c.severity ? t('constraints.severityValue', { n: c.severity }) : null,
    t(`constraints.persistence.${c.persistence}`),
    c.exercise_name ? t('constraints.onExerciseShort', { name: c.exercise_name }) : null,
  ].filter(Boolean).join(' · ');

  if (loading && rows.length === 0) {
    return <div className="h-20 rounded-2xl bg-neutral-900 animate-pulse" aria-label={t('common.loading')} />;
  }
  if (error) return <ErrorState title={t('constraints.loadError')} onRetry={() => void reload()} />;

  return (
    <section className="space-y-3" aria-labelledby="constraints-title" data-testid="constraints-panel">
      <h3 id="constraints-title" className="text-sm font-semibold text-white flex items-center gap-2">
        <Activity size={15} className="text-rose-300" aria-hidden="true" /> {t('constraints.title')}
      </h3>

      {open.length === 0 && !declaring && (
        <p className="text-sm text-neutral-400">{t(viewer === 'coach' ? 'constraints.emptyCoach' : 'constraints.empty')}</p>
      )}

      <ul className="space-y-2">
        {open.map(c => (
          <li key={c.id} className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 space-y-1" data-testid="constraint-open">
            <p className="text-sm text-white">{t(`constraints.kinds.${c.kind}`)}</p>
            <p className="text-xs text-neutral-400">{line(c)}</p>
            {c.description && <p className="text-xs text-neutral-300">« {c.description} »</p>}
            <p className="text-xs text-neutral-500">{t('constraints.since', { date: formatDate(c.declared_at, i18n.language) })}</p>
            {viewer === 'coach' && c.persistence === 'persistent' && (
              <p className="text-xs text-amber-300">{t('constraints.coachPersistentHint')}</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {c.persistence === 'temporary' && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(update(c.id, { persistence: 'persistent', note: 'still_there' }))}>
                  {t('constraints.stillThere')}
                </Button>
              )}
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(setStatus(c.id, 'resolved'))}>
                {t('constraints.resolve')}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {advice && (
        <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {t('constraints.professionalAdvice')}
        </p>
      )}

      {declaring ? (
        <DeclareConstraintForm
          userId={userId}
          onCancel={() => setDeclaring(false)}
          onDone={({ advice: needAdvice }) => { setDeclaring(false); setAdvice(needAdvice); void reload(); }}
        />
      ) : (
        <Button size="sm" variant={open.length ? 'ghost' : 'secondary'} onClick={() => { setDeclaring(true); setAdvice(false); }}>
          {t('constraints.declare')}
        </Button>
      )}

      {resolved.length > 0 && (
        <div>
          <button type="button" className="min-h-11 text-xs text-neutral-400" aria-expanded={showResolved} onClick={() => setShowResolved(v => !v)}>
            {t('constraints.resolvedToggle', { count: resolved.length })}
          </button>
          {showResolved && (
            <ul className="space-y-2" data-testid="constraint-resolved">
              {resolved.map(c => (
                <li key={c.id} className="rounded-xl border border-neutral-800/60 px-3 py-2">
                  <p className="text-sm text-neutral-300">{t(`constraints.kinds.${c.kind}`)} · {line(c)}</p>
                  <p className="text-xs text-neutral-500">
                    {formatDate(c.declared_at, i18n.language)} → {c.resolved_at ? formatDate(c.resolved_at, i18n.language) : ''}
                  </p>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(setStatus(c.id, 'open', 'came_back'))}>
                    {t('constraints.reopen')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {open.some(c => needsProfessionalAdvice(c)) && viewer === 'athlete' && !advice && (
        <p className="text-xs text-neutral-500">{t('constraints.professionalAdviceShort')}</p>
      )}
    </section>
  );
}
