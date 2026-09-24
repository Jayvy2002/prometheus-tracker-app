import { type KeyboardEvent, useEffect, useRef } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

interface TabListProps<T extends string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  labelledBy?: string;
}

export default function TabList<T extends string>({ tabs, value, onChange, labelledBy }: TabListProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  // On a narrow screen the bar scrolls: the selected tab is always brought into
  // view, so the user never loses where they are (and deep links land visible).
  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !selected) return;
    const left = selected.offsetLeft - (list.clientWidth - selected.offsetWidth) / 2;
    if (typeof list.scrollTo === 'function') list.scrollTo({ left: Math.max(0, left) });
    else list.scrollLeft = Math.max(0, left);
  }, [value]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex(tab => tab.id === value);
    if (index < 0) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      onChange(tabs[(index + 1) % tabs.length].id);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      onChange(tabs[(index - 1 + tabs.length) % tabs.length].id);
    } else if (event.key === 'Home') {
      event.preventDefault();
      onChange(tabs[0].id);
    } else if (event.key === 'End') {
      event.preventDefault();
      onChange(tabs[tabs.length - 1].id);
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className="relative flex gap-1 overflow-x-auto mb-4 -mx-4 px-4 scrollbar-hide"
    >
      {tabs.map(tab => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`min-h-11 px-3 rounded-lg text-sm font-medium whitespace-nowrap ${
              selected ? 'bg-primary text-ink' : 'bg-elevated text-ink-muted'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
