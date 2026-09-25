import { type FocusEvent, type InputHTMLAttributes, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'lucide-react';
import {
  checkDateBounds,
  formatIsoForInput,
  isIsoDate,
  parseTypedDate,
  withAutoSlash,
} from './dateFieldFormat';

type Problem = 'invalid' | 'beforeMin' | 'afterMax';

interface DateFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'size'> {
  /** ISO `YYYY-MM-DD`, or '' when there is no date. */
  value: string;
  /** Always an ISO `YYYY-MM-DD` real day within min/max, or '' when the field is emptied. */
  onChange: (iso: string) => void;
  label?: string;
  /** Error owned by the form (e.g. « date de naissance manquante »); the field's own check wins. */
  error?: string;
  min?: string;
  max?: string;
}

/**
 * Date field in the APP language (FR jj/mm/aaaa, EN mm/dd/yyyy), whatever the
 * phone's language — the native `<input type="date">` shows the phone's format.
 * Typing is tolerant; the calendar button opens the native picker (kept, hidden)
 * through `showPicker()`, or focuses the text when the browser has none.
 * An impossible or out-of-range date is shown as an error and never emitted:
 * the form keeps its last valid value until the text becomes a real date again.
 */
export default function DateField({
  value,
  onChange,
  label,
  error,
  min,
  max,
  id,
  name,
  disabled,
  required,
  className = '',
  onBlur,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  ...props
}: DateFieldProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => formatIsoForInput(value, lang));
  const [problem, setProblem] = useState<Problem | null>(null);

  // What this field last handed to the form, to tell our own echo from an outside change.
  const emittedRef = useRef(value);
  const langRef = useRef(lang);
  useEffect(() => {
    const langChanged = langRef.current !== lang;
    langRef.current = lang;
    if (!langChanged && value === emittedRef.current) return;
    emittedRef.current = value;
    setText(formatIsoForInput(value, lang));
    setProblem(null);
  }, [value, lang]);

  const emit = (iso: string) => {
    if (iso === value) return;
    emittedRef.current = iso;
    onChange(iso);
  };

  const pattern = t('dateField.placeholder');
  const message = problem === 'invalid'
    ? t('dateField.invalid', { format: pattern })
    : problem === 'beforeMin'
      ? t('dateField.beforeMin', { date: formatIsoForInput(min, lang) })
      : problem === 'afterMax'
        ? t('dateField.afterMax', { date: formatIsoForInput(max, lang) })
        : error;

  // A native <form> submit is blocked too while the text is not a usable date.
  useEffect(() => {
    textRef.current?.setCustomValidity(problem ? (message ?? '') : '');
  }, [problem, message]);

  /** Applies a candidate date: emits it when usable, otherwise says why. */
  const accept = (iso: string, showOutOfRange: boolean): boolean => {
    const bounds = checkDateBounds(iso, min, max);
    if (bounds !== 'ok') {
      if (showOutOfRange) setProblem(bounds);
      return false;
    }
    setProblem(null);
    emit(iso);
    return true;
  };

  const handleText = (raw: string) => {
    const next = withAutoSlash(text, raw);
    setText(next);
    const parsed = parseTypedDate(next, lang);
    if (parsed.status === 'empty') {
      setProblem(null);
      emit('');
    } else if (parsed.status === 'valid') {
      accept(parsed.iso, true);
    } else if (parsed.status === 'impossible') {
      setProblem('invalid');
    } else {
      // Still typing: no error yet, it comes on blur if the text stays incomplete.
      setProblem(null);
    }
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const parsed = parseTypedDate(text, lang);
    if (parsed.status === 'valid') {
      if (accept(parsed.iso, true)) setText(formatIsoForInput(parsed.iso, lang));
    } else if (parsed.status === 'empty') {
      // A form that keeps a date when emptied (the logger's session date) shows it again.
      setText(formatIsoForInput(value, lang));
    } else {
      setProblem('invalid');
    }
    onBlur?.(event);
  };

  const handlePicked = (picked: string) => {
    if (picked === '') {
      setText('');
      setProblem(null);
      emit('');
      return;
    }
    if (!isIsoDate(picked)) return;
    setText(formatIsoForInput(picked, lang));
    accept(picked, true);
  };

  const openPicker = () => {
    const picker = pickerRef.current;
    if (picker && typeof picker.showPicker === 'function') {
      try {
        picker.showPicker();
        return;
      } catch {
        // Not allowed here (iframe, old engine): fall back to typing.
      }
    }
    textRef.current?.focus();
  };

  const invalid = Boolean(message) || ariaInvalid === true || ariaInvalid === 'true';
  const descriptionIds = [describedBy, message ? errorId : null].filter(Boolean).join(' ') || undefined;
  const pickerValue = isIsoDate(value) ? value : '';

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-secondary">{label}</label>
      )}
      <div className="relative">
        <input
          ref={textRef}
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={pattern}
          value={text}
          disabled={disabled}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={descriptionIds}
          onChange={e => handleText(e.target.value)}
          onBlur={handleBlur}
          className={`w-full min-h-11 bg-surface-raised border border-line rounded-xl pl-4 pr-11 py-2.5 text-ink tabular-nums
            placeholder-ink-disabled focus:outline-none focus:ring-2 focus:ring-primary-hover/50 focus:border-primary-hover
            disabled:opacity-50 transition-all duration-200 ${invalid ? 'border-danger-hover' : ''} ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          aria-label={t('dateField.openPicker')}
          className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-h-11 min-w-11
            rounded-xl text-ink-muted hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
        >
          <Calendar size={18} aria-hidden="true" />
        </button>
        {/* The native picker, kept for its accessible calendar; the text field above is what people read. */}
        <input
          ref={pickerRef}
          type="date"
          name={name}
          tabIndex={-1}
          aria-hidden="true"
          value={pickerValue}
          min={isIsoDate(min) ? min : undefined}
          max={isIsoDate(max) ? max : undefined}
          disabled={disabled}
          onChange={e => handlePicked(e.target.value)}
          className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
        />
      </div>
      {message && <p id={errorId} role="alert" className="text-sm text-danger-muted">{message}</p>}
    </div>
  );
}
