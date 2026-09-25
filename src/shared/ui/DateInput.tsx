import DateField from './DateField';

interface DateInputProps {
  /** A workout date: `YYYY-MM-DD…` (timestamp or date); only the day part is shown. */
  value: string;
  /** Emits the chosen day at local noon, `YYYY-MM-DDT12:00:00` — the logger's timestamp contract. */
  onChange: (dateStr: string) => void;
  'aria-label'?: string;
}

function dayPart(value: string): string {
  return /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1] ?? '';
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Session date of the workout logger. Same display and typing as DateField (app
 * language, native picker); only the exchanged value differs: the workout's
 * `date` is a timestamp, so the day goes out at local noon like before. An
 * empty date still shows today, and clearing the text keeps the current date.
 */
export default function DateInput({ value, onChange, 'aria-label': ariaLabel }: DateInputProps) {
  return (
    <DateField
      value={dayPart(value) || todayIso()}
      onChange={iso => {
        if (iso) onChange(`${iso}T12:00:00`);
      }}
      aria-label={ariaLabel}
    />
  );
}
