import { Link } from 'react-router-dom';
import { objectRefHref } from '../../features/messages/domain/messageContent';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag, MessageCircle } from 'lucide-react';
import Button from '../ui/Button';
import DateField from '../ui/DateField';
import ErrorState from '../ui/ErrorState';
import { toast } from '../ui/Toast';
import { useGoals } from '../../features/goals/hooks/useGoals';
import {
  GOAL_KINDS,
  goalActions,
  focusGoal,
  goalHistory,
  lastReason,
  type Goal,
  type GoalKind,
  type GoalStatus,
} from '../../features/goals/domain/goalLifecycle';
import { formatDate, formatWeight, lbsToKg } from '../../lib/utils';
import { parseDecimalInput } from '../../features/workout/domain/workoutSetComplete';
import { userFacingError } from '../../lib/userFacingError';

const inputClass = 'w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/60';

/**
 * Vision §6 — the athlete's goal as a living cycle: the current goal, what can
 * happen to it (reached, maintained, paused, abandoned, replaced), and the
 * history with dates and reasons. Used by the athlete (Profile) and by their
 * active coach (client file); the database decides who may act.
 */
export default function GoalPanel({
  userId,
  unit,
  recomputeSoloTargets = false,
  talkHref,
}: {
  userId: string;
  unit: 'kg' | 'lbs';
  recomputeSoloTargets?: boolean;
  /** Thread base (« /messages » or « /messages/<client> ») when a conversation exists (Vision §19). */
  talkHref?: string;
}) {
  const { t, i18n } = useTranslation();
  const { goals, events, loading, error, busy, reload, start, transition } = useGoals(userId, { recomputeSoloTargets });
  const [pending, setPending] = useState<GoalStatus | null>(null);
  const [reason, setReason] = useState('');
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<GoalKind | ''>('');
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');

  const focus = focusGoal(goals);
  const history = goalHistory(goals, focus);
  const fail = (raw: string | null) => toast(t(`goals.errors.${raw}`, { defaultValue: userFacingError(raw, t('errors.generic')) }), 'error');

  const confirmTransition = async () => {
    if (!focus || !pending) return;
    const result = await transition(focus.id, pending, reason.trim());
    if (result.error) { fail(result.error); return; }
    toast(t('goals.saved'));
    setPending(null);
    setReason('');
  };

  const targetKg = target.trim() === '' ? null : parseDecimalInput(target);
  const targetInvalid = targetKg != null && !(Number.isFinite(targetKg) && (unit === 'lbs' ? targetKg >= 66 && targetKg <= 660 : targetKg >= 30 && targetKg <= 300));

  const confirmCreate = async () => {
    if (!kind || targetInvalid) return;
    const result = await start({
      kind,
      title: title.trim(),
      targetWeightKg: targetKg == null ? null : unit === 'lbs' ? lbsToKg(targetKg) : targetKg,
      targetDate: date || null,
      reason: reason.trim(),
    });
    if (result.error) { fail(result.error); return; }
    toast(t('goals.saved'));
    setCreating(false);
    setKind(''); setTitle(''); setTarget(''); setDate(''); setReason('');
  };

  if (loading && goals.length === 0) {
    return <div className="h-24 rounded-2xl bg-neutral-900 animate-pulse" aria-label={t('common.loading')} />;
  }
  if (error) return <ErrorState title={t('goals.loadError')} onRetry={() => void reload()} />;

  const describe = (goal: Goal) => [
    goal.title || null,
    goal.target_weight_kg ? t('goals.targetWeight', { weight: formatWeight(goal.target_weight_kg, unit) }) : null,
    goal.target_date ? t('goals.targetDate', { date: formatDate(goal.target_date, i18n.language) }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <section className="space-y-4" aria-labelledby="goal-panel-title" data-testid="goal-panel">
      <h3 id="goal-panel-title" className="text-sm font-semibold text-white flex items-center gap-2">
        <Flag size={15} className="text-blue-400" aria-hidden="true" /> {t('goals.title')}
      </h3>

      {focus ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-3" data-testid="goal-current">
          <div>
            <p className="text-xs text-neutral-500">{t(`goals.status.${focus.status}`)} · {t('goals.since', { date: formatDate(focus.started_at, i18n.language) })}</p>
            <p className="text-base font-semibold text-white">{t(`goals.kinds.${focus.kind}`)}</p>
            {describe(focus) && <p className="text-sm text-neutral-300 mt-0.5">{describe(focus)}</p>}
          </div>
          {!pending && !creating && (
            <div className="flex flex-wrap gap-2">
              {goalActions(focus).map(to => (
                <Button key={to} size="sm" variant="secondary" onClick={() => setPending(to)} disabled={busy}>
                  {t(`goals.actions.${focus.status === 'paused' && to === 'active' ? 'resume' : to}`)}
                </Button>
              ))}
              {talkHref ? (
                <Link
                  to={objectRefHref(talkHref, { kind: 'goal', id: focus.id })}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-blue-300 hover:text-blue-200"
                  data-testid="goal-talk"
                >
                  <MessageCircle size={14} aria-hidden="true" /> {t('messages.refs.talkAbout')}
                </Link>
              ) : null}
            </div>
          )}
          {pending && (
            <div className="space-y-2">
              <label htmlFor="goal-reason" className="block text-xs text-neutral-400">{t('goals.reasonLabel')}</label>
              <input id="goal-reason" className={inputClass} value={reason} maxLength={500} onChange={e => setReason(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void confirmTransition()} loading={busy}>
                  {t(`goals.actions.${focus.status === 'paused' && pending === 'active' ? 'resume' : pending}`)}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setPending(null); setReason(''); }}>{t('common.cancel')}</Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-neutral-400">{t('goals.empty')}</p>
      )}

      {!creating ? (
        <Button size="sm" variant={focus ? 'ghost' : 'primary'} onClick={() => { setCreating(true); setPending(null); }} disabled={busy}>
          {t(focus ? 'goals.new' : 'goals.first')}
        </Button>
      ) : (
        <div className="rounded-2xl border border-neutral-800 p-4 space-y-3" data-testid="goal-new">
          {focus && <p className="text-xs text-neutral-400">{t('goals.replaceHint')}</p>}
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('goals.kindLabel')}>
            {GOAL_KINDS.map(k => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`min-h-11 rounded-xl border px-3 text-sm text-left ${kind === k ? 'border-blue-500 bg-blue-500/10 text-blue-200' : 'border-neutral-800 bg-neutral-900 text-neutral-300'}`}
              >
                {t(`goals.kinds.${k}`)}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="goal-title" className="block text-xs text-neutral-400 mb-1">{t('goals.titleLabel')}</label>
            <input id="goal-title" className={inputClass} value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder={t('goals.titlePlaceholder')} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="goal-target" className="block text-xs text-neutral-400 mb-1">{t('goals.targetWeightLabel', { unit: unit === 'lbs' ? 'lb' : 'kg' })}</label>
              <input id="goal-target" className={inputClass} inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} aria-invalid={targetInvalid || undefined} />
            </div>
            <div>
              <label htmlFor="goal-date" className="block text-xs text-neutral-400 mb-1">{t('goals.targetDateLabel')}</label>
              <DateField id="goal-date" value={date} onChange={setDate} />
            </div>
          </div>
          {targetInvalid && <p className="text-xs text-amber-300">{t('goals.errors.targetWeight')}</p>}
          <div>
            <label htmlFor="goal-new-reason" className="block text-xs text-neutral-400 mb-1">{t('goals.reasonLabel')}</label>
            <input id="goal-new-reason" className={inputClass} value={reason} maxLength={500} onChange={e => setReason(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void confirmCreate()} disabled={!kind || targetInvalid} loading={busy}>{t('goals.save')}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setReason(''); }}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">{t('goals.history')}</p>
          <ul className="space-y-2" data-testid="goal-history">
            {history.map(goal => {
              const why = lastReason(goal, events);
              return (
                <li key={goal.id} className="rounded-xl border border-neutral-800/70 px-3 py-2">
                  <p className="text-sm text-white">
                    {t(`goals.kinds.${goal.kind}`)}
                    <span className="text-neutral-500"> · {t(`goals.status.${goal.status}`)}</span>
                  </p>
                  <p className="text-xs text-neutral-500">
                    {formatDate(goal.started_at, i18n.language)}
                    {goal.ended_at ? ` → ${formatDate(goal.ended_at, i18n.language)}` : ''}
                    {describe(goal) ? ` · ${describe(goal)}` : ''}
                  </p>
                  {why && <p className="text-xs text-neutral-400 mt-0.5">« {why} »</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
