import { type ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

const PAGE_EASE = [0.16, 1, 0.3, 1] as const;

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
  const reduceMotion = useReducedMotion();
  const currentIndex = getTabIndex(location.pathname);

  let x = 0;
  if (currentIndex !== -1 && previousTabIndex !== -1) {
    x = currentIndex > previousTabIndex ? 16 : -16;
  }

  useEffect(() => {
    if (currentIndex !== -1) {
      previousTabIndex = currentIndex;
    }
  });

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      key={location.pathname}
      className={className}
      initial={{ opacity: 0, x }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.38, ease: PAGE_EASE }}
    >
      {children}
    </motion.div>
  );
}
