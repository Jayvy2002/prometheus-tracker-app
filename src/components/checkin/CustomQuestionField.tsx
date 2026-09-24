import { useTranslation } from 'react-i18next';
import { localized, scaleRange, type AnswerValue, type CheckinQuestion } from '../../features/checkins/domain/checkinTemplate';
import { parseDecimalInput } from '../../features/workout/domain/workoutSetComplete';

const chip = (on: boolean) =>
  `min-h-11 min-w-11 rounded-xl border px-3 text-sm ${on ? 'border-blue-500 bg-blue-500/15 text-blue-100' : 'border-neutral-800 bg-neutral-900 text-neutral-300'}`;

/** One custom check-in question (Vision §11.1), with its « why » when the coach wrote one. */
export default function CustomQuestionField({
  question,
  value,
  onChange,
}: {
  question: CheckinQuestion;
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
}) {
  const { t, i18n } = useTranslation();
  const label = localized(question.label, i18n.language);
  const why = localized(question.why, i18n.language);
  const id = `cq-${question.id}`;

  const header = (
    <div className="mb-2">
      <p id={`${id}-label`} className="text-sm font-medium text-white">
        {label}
        {!question.required && <span className="text-neutral-500 font-normal"> · {t('checkin.optional')}</span>}
      </p>
      {why && <p className="text-xs text-neutral-500 mt-0.5">{t('checkinPlan.whyPrefix')} {why}</p>}
    </div>
  );

  if (question.type === 'yes_no') {
    return (
      <div role="group" aria-labelledby={`${id}-label`}>
        {header}
        <div className="flex gap-2">
          {[true, false].map(v => (
            <button key={String(v)} type="button" aria-pressed={value === v} className={chip(value === v)} onClick={() => onChange(value === v ? null : v)}>
              {t(v ? 'checkinPlan.yes' : 'checkinPlan.no')}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (question.type === 'scale' || question.type === 'pain' || question.type === 'fatigue') {
    const { min, max } = scaleRange(question);
    const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    return (
      <div role="group" aria-labelledby={`${id}-label`}>
        {header}
        <div className="flex flex-wrap gap-1.5">
          {steps.map(n => (
            <button key={n} type="button" aria-pressed={value === n} className={chip(value === n)} onClick={() => onChange(value === n ? null : n)}>
              {n}
            </button>
          ))}
        </div>
        {(question.type === 'pain' || question.type === 'fatigue') && (
          <p className="mt-1 text-xs text-neutral-500">{t(`checkinPlan.scaleEnds.${question.type}`)}</p>
        )}
      </div>
    );
  }

  if (question.type === 'choice') {
    const selected = Array.isArray(value) ? value : value == null ? [] : [String(value)];
    return (
      <div role="group" aria-labelledby={`${id}-label`}>
        {header}
        <div className="flex flex-wrap gap-2">
          {(question.options ?? []).map(opt => {
            const on = selected.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={on}
                className={chip(on)}
                onClick={() => {
                  if (question.multiple) {
                    const next = on ? selected.filter(s => s !== opt.id) : [...selected, opt.id];
                    onChange(next.length ? next : null);
                  } else {
                    onChange(on ? null : opt.id);
                  }
                }}
              >
                {localized(opt.label, i18n.language)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (question.type === 'number') {
    return (
      <div>
        {header}
        <div className="flex items-center gap-2">
          <input
            id={id}
            aria-labelledby={`${id}-label`}
            type="text"
            inputMode="decimal"
            className="w-32 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
            value={typeof value === 'number' ? String(value).replace('.', i18n.language.startsWith('fr') ? ',' : '.') : typeof value === 'string' ? value : ''}
            onChange={e => {
              const raw = e.target.value;
              const n = parseDecimalInput(raw);
              onChange(raw.trim() === '' ? null : Number.isFinite(n) ? n : raw);
            }}
          />
          {question.unit && <span className="text-sm text-neutral-400">{question.unit}</span>}
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      <textarea
        id={id}
        aria-labelledby={`${id}-label`}
        rows={2}
        maxLength={1000}
        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white resize-none"
        value={typeof value === 'string' ? value : ''}
        onChange={e => onChange(e.target.value || null)}
      />
    </div>
  );
}
