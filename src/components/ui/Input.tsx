import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';
import { Input as ShadcnInput } from './shadcn-input';

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
        <ShadcnInput
          ref={ref}
          className={cn(
            'h-11 rounded-xl bg-neutral-950/80 border-white/10 text-white',
            'placeholder:text-neutral-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
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
