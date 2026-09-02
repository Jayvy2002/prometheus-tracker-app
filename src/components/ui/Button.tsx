import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import ParticleButton from '../kokonutui/particle-button';
import { cn } from '../../lib/cn';
import { Button as ShadcnButton } from './shadcn-button';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  /** No :hover styles — first tap on touch must fire click, not "stick" on hover. */
  pressOnly?: boolean;
  children: ReactNode;
}

const sizeMap = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
} as const;

const variantMap = {
  primary: 'default',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'destructive',
} as const;

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
  const shadcnVariant = variantMap[variant];
  const shadcnSize = sizeMap[size];
  const content = (
    <>
      {loading && (
        <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </>
  );
  const classes = cn(
    pressOnly ? 'hover:scale-100' : '',
    className,
  );

  if (variant === 'primary') {
    return (
      <ParticleButton
        {...props}
        variant="default"
        size={shadcnSize}
        disabled={disabled || loading}
        className={cn('[&>svg:last-of-type]:hidden', classes)}
      >
        {content}
      </ParticleButton>
    );
  }

  return (
    <ShadcnButton
      {...props}
      variant={shadcnVariant}
      size={shadcnSize}
      disabled={disabled || loading}
      className={classes}
    >
      {content}
    </ShadcnButton>
  );
}
