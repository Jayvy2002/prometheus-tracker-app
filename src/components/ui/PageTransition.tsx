import { type ReactNode, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

// Map tab routes to their index for directional sliding
const TAB_ORDER: Record<string, number> = {
  '/dashboard': 0,
  '/workout': 1,
  '/checkin': 2,
  '/clients': 1,
  '/programs': 2,
  '/messages': 3,
  '/prometheus': 4,
  '/nutrition': 3,
  '/profile': 4,
};

function getTabIndex(pathname: string): number {
  for (const [path, idx] of Object.entries(TAB_ORDER)) {
    if (pathname.startsWith(path)) return idx;
  }
  return -1;
}

let previousTabIndex = -1;

export default function PageTransition({ children, className = '' }: PageTransitionProps) {
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);

  const currentIndex = getTabIndex(location.pathname);

  // Choose animation direction based on tab position
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
