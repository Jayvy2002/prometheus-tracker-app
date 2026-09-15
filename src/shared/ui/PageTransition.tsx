import { type ReactNode, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useCoachingStore } from '../../stores/coachingStore';
import { useAccountContext } from '@/features/account/hooks/useAccountContext';
import { mobileTabs, navPersona, tabIndexForPath } from '@/app/navigation/navConfig';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

let previousTabIndex = -1;
let previousPersona: ReturnType<typeof navPersona> | null = null;

export default function PageTransition({ children, className = '' }: PageTransitionProps) {
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const context = useAccountContext();
  const tracking = useCoachingStore(s => s.myTrackingConfig);
  const persona = navPersona(context);
  if (previousPersona !== null && previousPersona !== persona) {
    previousTabIndex = -1;
  }
  previousPersona = persona;
  const currentIndex = tabIndexForPath(location.pathname, mobileTabs(persona, tracking));

  let animClass = 'animate-fade-in-up';
  if (currentIndex !== -1 && previousTabIndex !== -1) {
    animClass = currentIndex > previousTabIndex
      ? 'animate-fade-in-left'
      : 'animate-fade-in-right';
  }

  useEffect(() => {
    if (currentIndex !== -1) {
      previousTabIndex = currentIndex;
    }
  });

  return (
    <div
      ref={containerRef}
      className={`${animClass} ${className}`}
      style={{ animationDuration: '0.38s', animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)', animationFillMode: 'both' }}
    >
      {children}
    </div>
  );
}
