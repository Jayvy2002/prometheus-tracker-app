import { useSyncExternalStore } from 'react';
import { currentTheme, type ResolvedTheme } from './theme';

function subscribe(onChange: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/** Theme on screen, for colours that cannot be CSS classes (chart SVG attributes). */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, () => currentTheme(), () => 'dark');
}
