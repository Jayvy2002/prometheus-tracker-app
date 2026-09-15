import { type SelectHTMLAttributes, useId } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export default function Select({ label, options, className = '', id, ...props }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="space-y-1.5">
      {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-ink-secondary">{label}</label>
      )}
      <select
        id={selectId}
        className={`w-full bg-surface-raised border border-line rounded-xl px-4 py-2.5 text-ink min-h-11
          focus:outline-none focus:ring-2 focus:ring-primary-hover/50 focus:border-primary-hover
          transition-all duration-200 appearance-none ${className}`}
        {...props}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
