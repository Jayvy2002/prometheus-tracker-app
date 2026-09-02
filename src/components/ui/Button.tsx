import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  /** No :hover styles — first tap on touch must fire click, not "stick" on hover. */
  pressOnly?: boolean;
  children: ReactNode;
}

const variants = {
  primary: {
    base: 'bg-blue-600 text-white shadow-lg shadow-blue-900/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]',
    hover: 'hover:bg-blue-500 hover:shadow-blue-900/50',
  },
  secondary: {
    base: 'bg-neutral-900/80 text-neutral-200 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
    hover: 'hover:bg-neutral-800 hover:border-white/15',
  },
  ghost: {
    base: 'bg-transparent text-neutral-300',
    hover: 'hover:bg-neutral-800/80',
  },
  danger: {
    base: 'bg-rose-600 text-white shadow-lg shadow-rose-900/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]',
    hover: 'hover:bg-rose-500',
  },
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3.5 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading,
  pressOnly = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const palette = variants[variant];
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium rounded-xl',
        'transition-all duration-200 ease-out touch-manipulation',
        palette.base,
        pressOnly ? '' : palette.hover,
        sizes[size],
        disabled || loading
          ? 'opacity-50 cursor-not-allowed'
          : pressOnly
            ? 'active:opacity-90'
            : 'active:scale-[0.96] hover:scale-[1.01]',
        className,
      )}
      disabled={disabled || loading}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
