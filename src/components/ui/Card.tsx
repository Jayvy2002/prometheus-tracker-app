import { type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  padding?: boolean;
  glow?: 'blue' | 'green' | 'orange' | 'purple' | false;
}

export default function Card({ children, className = '', onClick, padding = true, glow = false }: CardProps) {
  const glowClass = glow ? `glow-${glow}` : '';

  return (
    <div
      onClick={onClick}
      className={cn(
        'glass-card rounded-2xl',
        glowClass,
        padding ? 'p-4' : '',
        onClick
          ? 'cursor-pointer hover:border-white/12 active:scale-[0.99] transition-all duration-200 card-hover'
          : 'transition-colors duration-200',
        className,
      )}
    >
      {children}
    </div>
  );
}
