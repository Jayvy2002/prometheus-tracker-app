import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pathMatchesItem, tabIndexForPath, type NavItemDef } from '../../app/navigation/navConfig';
import { scrollHints, scrollOffsetToReveal } from '../../app/navigation/scrollHints';

/**
 * Sub-pages of the Corps and Suivi hubs. Each tab is a real page (its own URL),
 * so a direct link (`/weight?log=1`, `/nutrition?add=1`, a return from the
 * logger) shows the same tabs as the hub. On a narrow phone the bar scrolls
 * sideways instead of squeezing labels: an edge fades with a chevron where more
 * tabs hide, and the current tab is always brought into view.
 */
export default function HubTabs({
  label,
  items,
  extra,
}: {
  label: string;
  items: readonly NavItemDef[];
  /** A companion page shown beside the tabs, never as one more tab. */
  extra?: NavItemDef;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const listRef = useRef<HTMLUListElement>(null);
  const [hints, setHints] = useState({ start: false, end: false });
  const activeIndex = tabIndexForPath(pathname, items);

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const next = scrollHints(list.scrollLeft, list.clientWidth, list.scrollWidth);
    setHints(prev => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = activeIndex >= 0 ? list.children[activeIndex] as HTMLElement | undefined : undefined;
    if (active) {
      const offset = scrollOffsetToReveal(active.offsetLeft, active.offsetWidth, list.scrollLeft, list.clientWidth);
      if (offset !== null) {
        if (typeof list.scrollTo === 'function') list.scrollTo({ left: offset });
        else list.scrollLeft = offset;
      }
    }
    measure();
  }, [activeIndex, items.length, measure]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => measure());
      observer.observe(list);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const ExtraIcon = extra?.icon;
  const extraActive = extra ? pathMatchesItem(pathname, extra) : false;

  return (
    <nav aria-label={label} className="px-4 pt-4">
      {items.length > 1 ? (
        <div className="relative">
          <ul ref={listRef} onScroll={measure} className="flex gap-1 overflow-x-auto scrollbar-hide">
            {items.map((item, index) => {
              const active = index === activeIndex;
              return (
                <li key={item.id} className="flex-auto shrink-0">
                  <Link
                    to={item.path}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-xl px-3 text-sm font-medium ${active ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-300 hover:text-white'}`}
                  >
                    {t(item.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
          {hints.start ? (
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center bg-gradient-to-r from-black via-black/80 to-transparent">
              <ChevronLeft size={16} className="text-neutral-400" />
            </div>
          ) : null}
          {hints.end ? (
            <div aria-hidden="true" data-testid="hub-tabs-more" className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end bg-gradient-to-l from-black via-black/80 to-transparent">
              <ChevronRight size={16} className="text-neutral-400" />
            </div>
          ) : null}
        </div>
      ) : null}
      {extra && ExtraIcon ? (
        <Link
          to={extra.path}
          aria-current={extraActive ? 'page' : undefined}
          className={`mt-2 inline-flex min-h-11 items-center gap-2 text-sm ${extraActive ? 'text-white font-medium' : 'text-neutral-300 hover:text-white'}`}
        >
          <ExtraIcon size={16} className="text-blue-300" aria-hidden="true" /> {t(extra.labelKey)}
        </Link>
      ) : null}
    </nav>
  );
}

/** While a hub waits for what the viewer may open, it says it is loading. */
export function HubLoading() {
  const { t } = useTranslation();
  return (
    <div className="min-h-[40vh] flex items-center justify-center" role="status">
      <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" aria-hidden="true" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}
