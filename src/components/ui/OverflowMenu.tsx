import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface OverflowAction {
  id: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

interface OverflowMenuProps {
  label: string;
  actions: OverflowAction[];
}

export default function OverflowMenu({ label, actions }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const items = rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items?.[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[10rem] rounded-xl border border-neutral-800 bg-neutral-950 p-1 shadow-xl"
        >
          {actions.map(action => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              onClick={e => {
                e.stopPropagation();
                setOpen(false);
                action.onSelect();
              }}
              className={`w-full text-left min-h-11 px-3 rounded-lg text-sm ${
                action.danger ? 'text-rose-300 hover:bg-rose-500/10' : 'text-white hover:bg-neutral-800'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function OverflowMenuPortal({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
