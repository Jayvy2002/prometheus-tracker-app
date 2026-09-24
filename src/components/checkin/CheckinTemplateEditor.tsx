import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import {
  QUESTION_TYPES,
  emptyQuestion,
  localized,
  moveQuestion,
  questionErrors,
  type CheckinQuestion,
  type QuestionType,
} from '../../features/checkins/domain/checkinTemplate';

const input = 'w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white';
const small = 'text-xs text-neutral-400 block mb-1';

/**
 * Vision §11.1 — build a reusable check-in template: typed questions, labels
 * FR/EN, a « why » shown to the athlete, optional conditions on an earlier
 * answer. Essential first, details only when needed: 20 questions at most.
 */
export default function CheckinTemplateEditor({
  initialName,
  initialQuestions,
  saving,
  onSave,
  onCancel,
}: {
  initialName: string;
  initialQuestions: CheckinQuestion[];
  saving: boolean;
  onSave: (name: string, questions: CheckinQuestion[]) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState(initialName);
  const [questions, setQuestions] = useState<CheckinQuestion[]>(initialQuestions);

  const update = (index: number, patch: Partial<CheckinQuestion>) =>
    setQuestions(qs => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  const errorsAt = (index: number) => questionErrors(questions[index], questions.slice(0, index));
  const invalid = !name.trim() || questions.some((_, i) => errorsAt(i).length > 0);

  return (
    <div className="space-y-4" data-testid="checkin-template-editor">
      <div>
        <label htmlFor="tpl-name" className={small}>{t('checkinPlan.templateName')}</label>
        <input id="tpl-name" className={input} maxLength={80} value={name} onChange={e => setName(e.target.value)} />
      </div>

      {questions.length === 0 && <p className="text-sm text-neutral-400">{t('checkinPlan.noQuestions')}</p>}

      <ol className="space-y-3">
        {questions.map((q, index) => {
          const earlier = questions.slice(0, index);
          const target = earlier.find(e => e.id === q.show_if?.question);
          const errors = errorsAt(index);
          return (
            <li key={q.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">{index + 1}.</span>
                <select
                  aria-label={t('checkinPlan.questionType')}
                  className={`${input} flex-1`}
                  value={q.type}
                  onChange={e => update(index, { ...emptyQuestion(e.target.value as QuestionType), id: q.id, label: q.label, why: q.why, required: q.required, show_if: q.show_if })}
                >
                  {QUESTION_TYPES.map(type => <option key={type} value={type}>{t(`checkinPlan.types.${type}`)}</option>)}
                </select>
                <IconButton label={t('checkinPlan.moveUp')} onClick={() => setQuestions(qs => moveQuestion(qs, index, -1))} disabled={index === 0}>
                  <ArrowUp size={16} />
                </IconButton>
                <IconButton label={t('checkinPlan.moveDown')} onClick={() => setQuestions(qs => moveQuestion(qs, index, 1))} disabled={index === questions.length - 1}>
                  <ArrowDown size={16} />
                </IconButton>
                <IconButton
                  label={t('checkinPlan.removeQuestion')}
                  onClick={() => setQuestions(qs => qs.filter((_, i) => i !== index).map(x => (x.show_if?.question === q.id ? { ...x, show_if: undefined } : x)))}
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className={small} htmlFor={`${q.id}-fr`}>{t('checkinPlan.labelFr')}</label>
                  <input id={`${q.id}-fr`} className={input} maxLength={200} value={q.label.fr} onChange={e => update(index, { label: { ...q.label, fr: e.target.value } })} aria-invalid={errors.includes('label') || undefined} />
                </div>
                <div>
                  <label className={small} htmlFor={`${q.id}-en`}>{t('checkinPlan.labelEn')}</label>
                  <input id={`${q.id}-en`} className={input} maxLength={200} value={q.label.en ?? ''} onChange={e => update(index, { label: { ...q.label, en: e.target.value } })} />
                </div>
              </div>
              <div>
                <label className={small} htmlFor={`${q.id}-why`}>{t('checkinPlan.why')}</label>
                <input id={`${q.id}-why`} className={input} maxLength={200} value={q.why?.fr ?? ''} placeholder={t('checkinPlan.whyPlaceholder')} onChange={e => update(index, { why: { ...q.why, fr: e.target.value } })} />
              </div>

              {q.type === 'scale' && (
                <div className="flex gap-2" role="group" aria-label={t('checkinPlan.scaleRange')}>
                  {[{ min: 1, max: 5 }, { min: 0, max: 10 }].map(r => (
                    <Button key={r.max} size="sm" variant={q.min === r.min && q.max === r.max ? 'primary' : 'secondary'} onClick={() => update(index, r)}>
                      {r.min}–{r.max}
                    </Button>
                  ))}
                </div>
              )}
              {q.type === 'number' && (
                <div>
                  <label className={small} htmlFor={`${q.id}-unit`}>{t('checkinPlan.unit')}</label>
                  <input id={`${q.id}-unit`} className={`${input} max-w-40`} maxLength={20} value={q.unit ?? ''} onChange={e => update(index, { unit: e.target.value })} />
                </div>
              )}
              {q.type === 'choice' && (
                <div className="space-y-2">
                  {(q.options ?? []).map((opt, oi) => (
                    <div key={opt.id} className="flex gap-2">
                      <input
                        aria-label={t('checkinPlan.optionLabel', { n: oi + 1 })}
                        className={input}
                        maxLength={80}
                        value={opt.label.fr}
                        onChange={e => update(index, { options: (q.options ?? []).map(o => (o.id === opt.id ? { ...o, label: { ...o.label, fr: e.target.value } } : o)) })}
                      />
                      <IconButton label={t('checkinPlan.removeOption')} onClick={() => update(index, { options: (q.options ?? []).filter(o => o.id !== opt.id) })} disabled={(q.options ?? []).length <= 2}>
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2 items-center">
                    <Button size="sm" variant="ghost" disabled={(q.options ?? []).length >= 8} onClick={() => update(index, { options: [...(q.options ?? []), { id: `o${Date.now().toString(36)}`, label: { fr: '' } }] })}>
                      {t('checkinPlan.addOption')}
                    </Button>
                    <label className="flex items-center gap-2 text-xs text-neutral-300 min-h-11">
                      <input type="checkbox" checked={Boolean(q.multiple)} onChange={e => update(index, { multiple: e.target.checked })} />
                      {t('checkinPlan.multiple')}
                    </label>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-neutral-300 min-h-11">
                  <input type="checkbox" checked={Boolean(q.required)} onChange={e => update(index, { required: e.target.checked })} />
                  {t('checkinPlan.required')}
                </label>
                {earlier.length > 0 && (
                  <select
                    aria-label={t('checkinPlan.showIf')}
                    className={`${input} max-w-60`}
                    value={q.show_if?.question ?? ''}
                    onChange={e => {
                      const ref = earlier.find(x => x.id === e.target.value);
                      if (!ref) { update(index, { show_if: undefined }); return; }
                      const cond = ref.type === 'yes_no' ? { question: ref.id, equals: true }
                        : ref.type === 'choice' ? { question: ref.id, equals: ref.options?.[0]?.id ?? '' }
                          : ref.type === 'text' ? { question: ref.id }
                            : { question: ref.id, gte: ref.type === 'scale' ? (ref.max ?? 5) : 6 };
                      update(index, { show_if: cond });
                    }}
                  >
                    <option value="">{t('checkinPlan.always')}</option>
                    {earlier.map((e, ei) => (
                      <option key={e.id} value={e.id}>{t('checkinPlan.onlyIf', { n: ei + 1, label: localized(e.label, i18n.language) || '…' })}</option>
                    ))}
                  </select>
                )}
                {target && q.show_if && target.type === 'yes_no' && (
                  <select aria-label={t('checkinPlan.conditionValue')} className={`${input} max-w-32`} value={String(q.show_if.equals)} onChange={e => update(index, { show_if: { question: target.id, equals: e.target.value === 'true' } })}>
                    <option value="true">{t('checkinPlan.yes')}</option>
                    <option value="false">{t('checkinPlan.no')}</option>
                  </select>
                )}
                {target && q.show_if && target.type === 'choice' && (
                  <select aria-label={t('checkinPlan.conditionValue')} className={`${input} max-w-40`} value={String(q.show_if.equals ?? '')} onChange={e => update(index, { show_if: { question: target.id, equals: e.target.value } })}>
                    {(target.options ?? []).map(o => <option key={o.id} value={o.id}>{localized(o.label, i18n.language) || '…'}</option>)}
                  </select>
                )}
                {target && q.show_if && ['scale', 'number', 'pain', 'fatigue'].includes(target.type) && (
                  <label className="flex items-center gap-2 text-xs text-neutral-300">
                    {t('checkinPlan.atLeast')}
                    <input type="number" className={`${input} w-20`} value={q.show_if.gte ?? 0} onChange={e => update(index, { show_if: { question: target.id, gte: Number(e.target.value) } })} />
                  </label>
                )}
              </div>
              {errors.length > 0 && (
                <p className="text-xs text-amber-300">{errors.map(err => t(`checkinPlan.errors.${err}`)).join(' ')}</p>
              )}
            </li>
          );
        })}
      </ol>

      {questions.length < 20 && (
        <div>
          <p className={small}>{t('checkinPlan.addQuestion')}</p>
          <div className="flex flex-wrap gap-2">
            {QUESTION_TYPES.map(type => (
              <Button key={type} size="sm" variant="secondary" onClick={() => setQuestions(qs => [...qs, emptyQuestion(type)])}>
                {t(`checkinPlan.types.${type}`)}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={() => onSave(name, questions)} disabled={invalid} loading={saving}>{t('checkinPlan.saveTemplate')}</Button>
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  );
}
