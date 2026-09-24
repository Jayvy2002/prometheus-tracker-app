import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';
import { declareConstraint } from '../../features/constraints/api/constraintsApi';
import {
  BODY_AREAS,
  CONSTRAINT_KINDS,
  needsProfessionalAdvice,
  type BodyArea,
  type ConstraintKind,
  type ConstraintPersistence,
} from '../../features/constraints/domain/constraints';
import { userFacingError } from '../../lib/userFacingError';

const chip = (on: boolean) =>
  `min-h-11 rounded-xl border px-3 text-sm ${on ? 'border-blue-500 bg-blue-500/10 text-blue-200' : 'border-neutral-800 bg-neutral-900 text-neutral-300'}`;

/**
 * Vision §7.6 — declare a pain, injury, limitation or temporary constraint.
 * From a session it is prefilled with the exercise and « temporary »; it works
 * offline (queued). No diagnosis: only what the athlete says, plus advice to
 * see a professional when it is strong, lasting or an injury.
 */
export default function DeclareConstraintForm({
  userId,
  exerciseName = null,
  workoutId = null,
  defaultKind = 'pain',
  onDone,
  onCancel,
}: {
  userId: string;
  exerciseName?: string | null;
  workoutId?: string | null;
  defaultKind?: ConstraintKind;
  onDone: (result: { queued: boolean; advice: boolean }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ConstraintKind>(defaultKind);
  const [area, setArea] = useState<BodyArea | ''>('');
  const [severity, setSeverity] = useState<number | null>(null);
  const [persistence, setPersistence] = useState<ConstraintPersistence>(exerciseName ? 'temporary' : 'persistent');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const needsArea = kind !== 'constraint';
  const canSave = !saving && (!needsArea || area !== '') && (kind !== 'constraint' || description.trim().length > 0);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const result = await declareConstraint({
      userId,
      kind,
      bodyArea: (area || 'other') as BodyArea,
      description,
      severity: kind === 'pain' ? severity : null,
      persistence,
      exerciseName,
      workoutId,
    });
    setSaving(false);
    if (result.error) {
      toast(userFacingError(result.error, t('constraints.saveFailed')), 'error');
      return;
    }
    toast(result.queued ? t('constraints.savedOffline') : t('constraints.saved'));
    onDone({ queued: result.queued, advice: needsProfessionalAdvice({ kind, severity, persistence }) });
  };

  return (
    <div className="space-y-4" data-testid="declare-constraint">
      {exerciseName && <p className="text-sm text-neutral-400">{t('constraints.onExercise', { name: exerciseName })}</p>}
      <div>
        <p className="text-xs text-neutral-400 mb-2">{t('constraints.kindLabel')}</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('constraints.kindLabel')}>
          {CONSTRAINT_KINDS.map(k => (
            <button key={k} type="button" aria-pressed={kind === k} className={chip(kind === k)} onClick={() => setKind(k)}>
              {t(`constraints.kinds.${k}`)}
            </button>
          ))}
        </div>
      </div>
      {needsArea && (
        <div>
          <p className="text-xs text-neutral-400 mb-2">{t('constraints.areaLabel')}</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('constraints.areaLabel')}>
            {BODY_AREAS.map(a => (
              <button key={a} type="button" aria-pressed={area === a} className={chip(area === a)} onClick={() => setArea(a)}>
                {t(`constraints.areas.${a}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      {kind === 'pain' && (
        <div>
          <p className="text-xs text-neutral-400 mb-2">{t('constraints.severityLabel')}</p>
          <div className="grid grid-cols-5 gap-2" role="group" aria-label={t('constraints.severityLabel')}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" aria-pressed={severity === n} className={chip(severity === n)} onClick={() => setSeverity(n)}>
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-neutral-500">{t('constraints.severityHint')}</p>
        </div>
      )}
      <div>
        <p className="text-xs text-neutral-400 mb-2">{t('constraints.persistenceLabel')}</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('constraints.persistenceLabel')}>
          {(['temporary', 'persistent'] as const).map(p => (
            <button key={p} type="button" aria-pressed={persistence === p} className={chip(persistence === p)} onClick={() => setPersistence(p)}>
              {t(`constraints.persistence.${p}`)}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-neutral-500">{t(`constraints.persistenceHint.${persistence}`)}</p>
      </div>
      <div>
        <label htmlFor="constraint-description" className="block text-xs text-neutral-400 mb-1">
          {t(kind === 'constraint' ? 'constraints.descriptionRequired' : 'constraints.descriptionLabel')}
        </label>
        <textarea
          id="constraint-description"
          rows={2}
          maxLength={500}
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white resize-none"
        />
      </div>
      <p className="text-xs text-neutral-500">{t('constraints.noDiagnosis')}</p>
      <div className="flex gap-2">
        <Button onClick={() => void save()} disabled={!canSave} loading={saving}>{t('constraints.save')}</Button>
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  );
}
