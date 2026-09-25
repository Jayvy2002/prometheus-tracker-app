import { Check } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface BaseProps {
  label: string;
  options: readonly Option[];
  /** Hides the visible label (the group keeps its accessible name). */
  hideLabel?: boolean;
  /** One scrolling row instead of wrapping. */
  scroll?: boolean;
  /** One row, no wrap, inside a parent that scrolls. */
  inline?: boolean;
  disabled?: boolean;
}

type Props = BaseProps & (
  | { multiple?: false; value: string; onChange: (value: string) => void; allowEmpty?: boolean }
  | { multiple: true; value: readonly string[]; onChange: (value: string[]) => void; allowEmpty?: never }
);

/**
 * Pills instead of selects and checkbox lists: one tap to choose, the choice
 * stays visible. Single choice can be cleared by tapping it again when
 * `allowEmpty` is set.
 */
export default function ChipGroup(props: Props) {
  const { label, options, hideLabel, scroll, inline, disabled } = props;
  const selected = (value: string) => props.multiple ? props.value.includes(value) : props.value === value;
  const toggle = (value: string) => {
    if (props.multiple) {
      props.onChange(props.value.includes(value) ? props.value.filter(v => v !== value) : [...props.value, value]);
    } else if (props.value === value) {
      if (props.allowEmpty) props.onChange('');
    } else {
      props.onChange(value);
    }
  };
  return (
    <fieldset disabled={disabled} className={inline ? 'shrink-0' : 'min-w-0'}>
      <legend className={hideLabel ? 'sr-only' : 'mb-2 text-sm text-neutral-300'}>{label}</legend>
      <div className={scroll ? '-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide' : inline ? 'flex gap-2' : 'flex flex-wrap gap-2'}>
        {options.map(option => {
          const on = selected(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(option.value)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors ${
                on
                  ? 'border-blue-500 bg-blue-600/20 text-white'
                  : 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-[#525252]'
              }`}
            >
              {on && <Check size={14} aria-hidden="true" />}
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
