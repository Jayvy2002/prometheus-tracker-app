import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-neutral-300">{label}</label>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full bg-neutral-950/80 border border-white/10 rounded-xl px-4 py-2.5 text-white',
            'placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-200',
            error ? 'border-rose-500' : '',
            className,
          )}
          {...props}
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
