import { type ReactNode } from 'react';

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
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
      onClick={onClick}
      className={`bg-surface-raised/60 border border-line/50 rounded-2xl ${glowClass}
        ${padding ? 'p-4' : ''}
        ${onClick
          ? 'cursor-pointer hover:bg-surface-raised/80 hover:border-surface-active/70 transition-colors duration-200'
          : 'transition-colors duration-200'
        }
        ${className}`}
    >
      {children}
    </div>
  );
}
