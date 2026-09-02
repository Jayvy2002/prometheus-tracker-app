import { type ReactNode } from 'react';
import { LiquidGlassCard } from '../kokonutui/liquid-glass-card';
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
    <LiquidGlassCard
      glassSize="sm"
      glassEffect
      onClick={onClick}
      className={cn(
        'border-white/30 bg-card/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]',
        glowClass,
        padding ? '' : 'p-0',
        onClick
          ? 'cursor-pointer [@media(hover:hover)]:hover:border-white/25 active:scale-[0.99] transition-all duration-200 card-hover'
          : 'transition-colors duration-200',
        className,
      )}
    >
      {children}
    </LiquidGlassCard>
  );
}
