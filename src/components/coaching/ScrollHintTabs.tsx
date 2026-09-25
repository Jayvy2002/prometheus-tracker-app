import { useEffect, useRef, useState } from 'react';
import TabList, { type TabItem } from '../ui/TabList';

/**
 * The client file has more tabs than a phone shows. TabList already scrolls,
 * keeps the selected tab in view and moves with the arrow keys; this adds the
 * visible cue: a fade on each edge that still has tabs behind it.
 */
export default function ScrollHintTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const list = wrapRef.current?.querySelector<HTMLElement>('[role="tablist"]');
    if (!list) return;
    const update = () => {
      const max = list.scrollWidth - list.clientWidth;
      setEdges({ start: list.scrollLeft > 4, end: max - list.scrollLeft > 4 });
    };
    update();
    list.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(list);
    window.addEventListener('resize', update);
    return () => {
      list.removeEventListener('scroll', update);
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [tabs.length]);

  return (
    <div ref={wrapRef} className="relative" data-testid="client-file-tabs">
      <TabList tabs={tabs} value={value} onChange={onChange} />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 -left-4 w-8 bg-gradient-to-r from-page to-transparent transition-opacity ${edges.start ? 'opacity-100' : 'opacity-0'}`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 -right-4 w-10 bg-gradient-to-l from-page to-transparent transition-opacity ${edges.end ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
