import { type InputHTMLAttributes, forwardRef, useId } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const descriptionIds = [describedBy, error ? errorId : null].filter(Boolean).join(' ') || undefined;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-neutral-300">{label}</label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-describedby={descriptionIds}
          aria-invalid={error ? true : ariaInvalid}
          className={`w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-white
            placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
            transition-all duration-200 ${error ? 'border-rose-500' : ''} ${className}`}
          {...props}
        />
        {error && <p id={errorId} role="alert" className="text-sm text-rose-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
