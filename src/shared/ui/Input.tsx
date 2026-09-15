import { type InputHTMLAttributes, forwardRef, useId } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, type, inputMode, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const descriptionIds = [describedBy, error ? errorId : null].filter(Boolean).join(' ') || undefined;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-ink-secondary">{label}</label>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          inputMode={inputMode ?? (type === 'number' ? 'decimal' : undefined)}
          aria-describedby={descriptionIds}
          aria-invalid={error ? true : ariaInvalid}
          className={`w-full bg-surface-raised border border-line rounded-xl px-4 py-2.5 text-ink
            placeholder-ink-disabled focus:outline-none focus:ring-2 focus:ring-primary-hover/50 focus:border-primary-hover
            transition-all duration-200 ${error ? 'border-danger-hover' : ''} ${className}`}
          {...props}
        />
        {error && <p id={errorId} role="alert" className="text-sm text-danger-muted">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
