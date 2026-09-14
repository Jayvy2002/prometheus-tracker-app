import { type KeyboardEvent } from 'react';

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
      role="tablist"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto mb-4 -mx-4 px-4 scrollbar-hide"
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
              selected ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
