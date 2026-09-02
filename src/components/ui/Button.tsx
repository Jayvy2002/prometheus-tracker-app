import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import AttractButton from '../kokonutui/attract-button';
import GradientButton from '../kokonutui/gradient-button';
import HoldButton from '../kokonutui/hold-button';
import ParticleButton from '../kokonutui/particle-button';
import { cn } from '../../lib/cn';
import { Button as ShadcnButton } from './shadcn-button';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gradient';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  /** No :hover styles — first tap on touch must fire click, not "stick" on hover. */
  pressOnly?: boolean;
  /** Particle burst on click (confirm / submit). */
  burst?: boolean;
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
  gradient: 'default',
} as const;

export default function Button({
  variant = 'primary',
  size = 'md',
  loading,
  pressOnly = false,
  burst = false,
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

  if (variant === 'gradient') {
    return (
      <GradientButton
        {...props}
        variant="blue"
        disabled={disabled || loading}
        className={cn('h-9 px-4 text-sm', classes)}
      >
        {content}
      </GradientButton>
    );
  }

  if (variant === 'danger') {
    return (
      <HoldButton
        {...props}
        variant="red"
        holdDuration={1100}
        disabled={disabled || loading}
        className={cn('min-w-0', classes)}
      >
        {content}
      </HoldButton>
    );
  }

  if (variant === 'primary' && burst) {
    return (
      <ParticleButton
        {...props}
        variant="default"
        size={shadcnSize}
        disabled={disabled || loading}
        className={classes}
      >
        {content}
      </ParticleButton>
    );
  }

  if (variant === 'primary') {
    return (
      <AttractButton
        {...props}
        disabled={disabled || loading}
        className={cn(
          size === 'sm' ? 'h-8 px-3 text-xs' : size === 'lg' ? 'h-10 px-8' : 'h-9 px-4 text-sm',
          classes,
        )}
        particleCount={size === 'sm' ? 8 : 12}
        attractRadius={size === 'sm' ? 22 : 32}
      >
        {content}
      </AttractButton>
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
