import React from 'react';
import { useTranslation } from 'react-i18next';
import type { CoachQuestionnaire, QuestionnaireAnswer, QuestionnaireIssue } from '../../lib/coachQuestionnaire';

interface Props {
  definition: CoachQuestionnaire;
  answers: Record<string, QuestionnaireAnswer>;
  onChange: (answers: Record<string, QuestionnaireAnswer>) => void;
  issues?: QuestionnaireIssue[];
  disabled?: boolean;
  onlySectionId?: string;
}

/** Shared by builder preview and athlete form; persistence belongs to the caller. */
export default function CoachQuestionnaireFields({
  definition, answers, onChange, issues = [], disabled = false, onlySectionId,
}: Props) {
  const { t, i18n } = useTranslation();
  const prefix = React.useId();
  const language = i18n.language.startsWith('fr') ? 'fr' : 'en';
  const update = (id: string, value: QuestionnaireAnswer | undefined) => {
    const next = { ...answers };
    if (value === undefined) delete next[id];
    else next[id] = value;
    onChange(next);
  };
  const weekdays = Array.from({ length: 7 }, (_, n) => ({
    id: n + 1,
    label: new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' })
      .format(new Date(Date.UTC(2024, 0, n + 1))),
  }));
  const control = 'w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-white';
  const firstMedicalId = definition.sections.flatMap(s => s.questions).find(q => q.medical)?.id;
  const sections = onlySectionId
    ? definition.sections.filter(section => section.id === onlySectionId)
    : definition.sections;
  return <div className="space-y-6">
    <p className="text-sm text-neutral-400">{t('coachQuestionnaire.audience')}</p>
    {sections.map(section => <section key={section.id} aria-labelledby={prefix + section.id}>
      <h2 id={prefix + section.id} className="text-lg font-semibold mb-4">{section.label[language]}</h2>
      <div className="space-y-5">
        {section.questions.map(q => {
          const id = prefix + q.id;
          const error = issues.find(issue => issue.path === 'answers.' + q.id);
          const value = answers[q.id];
          const descriptionId = error ? id + '-error' : undefined;
          const common = {
            id, disabled, 'aria-invalid': error ? true : undefined,
            'aria-describedby': descriptionId, 'aria-required': q.required,
          } as const;
          const multiple = q.type === 'multi' || q.type === 'weekdays';
          return <div key={q.id}>
            {q.id === firstMedicalId && (
              <p role="note" className="text-sm text-neutral-400 mb-4">{t('coachQuestionnaire.sensitiveNotice')}</p>
            )}
            {multiple ? <fieldset disabled={disabled} aria-describedby={descriptionId} aria-invalid={!!error}>
              <legend className="text-sm font-medium mb-2">
                {q.label[language]}{q.required ? ' *' : ''}
              </legend>
              <div className="space-y-2">
                {(q.type === 'weekdays' ? weekdays : (q.options ?? []).map(o => ({ id: o.id, label: o.label[language] }))).map(option => {
                  const selected = Array.isArray(value) && value.some(v => v === option.id);
                  return <label key={option.id} className="flex items-center gap-2 min-h-11">
                    <input type="checkbox" checked={selected} onChange={() => {
                      if (q.type === 'weekdays') {
                        const values = Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : [];
                        const item = Number(option.id);
                        update(q.id, selected ? values.filter(v => v !== item) : [...values, item]);
                      } else {
                        const values = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
                        const item = String(option.id);
                        update(q.id, selected ? values.filter(v => v !== item) : [...values, item]);
                      }
                    }}/>{option.label}
                  </label>;
                })}
              </div>
            </fieldset> : <>
              <label htmlFor={id} className="block text-sm font-medium mb-2">
                {q.label[language]}{q.required ? ' *' : ''}
              </label>
              {q.type === 'text' ? <textarea {...common} className={control} rows={3} maxLength={10000}
                value={typeof value === 'string' ? value : ''} onChange={e => update(q.id, e.target.value)}/>
                : q.type === 'number' ? <input {...common} className={control} type="number" step="any"
                  value={typeof value === 'number' ? value : ''} onChange={e =>
                    update(q.id, Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : undefined)}/>
                  : <select {...common} className={control}
                    value={q.type === 'yes_no' ? typeof value === 'boolean' ? String(value) : '' : typeof value === 'string' ? value : ''}
                    onChange={e => update(q.id, e.target.value === '' ? undefined
                      : q.type === 'yes_no' ? e.target.value === 'true' : e.target.value)}>
                    <option value="">{t('coachQuestionnaire.choose')}</option>
                    {q.type === 'yes_no' ? <>
                      <option value="true">{t('common.yes')}</option>
                      <option value="false">{t('common.no')}</option>
                    </> : q.options?.map(option => <option key={option.id} value={option.id}>{option.label[language]}</option>)}
                  </select>}
            </>}
            {error && <p id={descriptionId} role="alert" className="text-sm text-red-400 mt-1">
              {t(error.code === 'required' ? 'coachQuestionnaire.required' : 'coachQuestionnaire.invalid')}
            </p>}
          </div>;
        })}
      </div>
    </section>)}
  </div>;
}
