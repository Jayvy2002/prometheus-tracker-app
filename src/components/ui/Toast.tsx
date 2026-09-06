import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, X, Undo2 } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  onUndo?: () => void;
}

let toastQueue: ToastMessage[] = [];
let listeners: ((toasts: ToastMessage[]) => void)[] = [];

function notify() {
  listeners.forEach(fn => fn([...toastQueue]));
}

export function toast(message: string, type: ToastType = 'success') {
  const id = crypto.randomUUID();
  toastQueue = [...toastQueue, { id, message, type }];
  notify();
  setTimeout(() => {
    toastQueue = toastQueue.filter(t => t.id !== id);
    notify();
  }, 3000);
}

export function toastWithUndo(message: string, onUndo: () => void) {
  const id = crypto.randomUUID();
  const wrappedUndo = () => {
    // Dismiss toast immediately when undo is clicked
    toastQueue = toastQueue.filter(t => t.id !== id);
    notify();
    onUndo();
  };
  toastQueue = [...toastQueue, { id, message, type: 'info', onUndo: wrappedUndo }];
  notify();
  setTimeout(() => {
    toastQueue = toastQueue.filter(t => t.id !== id);
    notify();
  }, 4500);
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    listeners.push(setToasts);
    setToasts([...toastQueue]);
    return () => {
      listeners = listeners.filter(l => l !== setToasts);
    };
  }, []);

  const dismiss = (id: string) => {
    toastQueue = toastQueue.filter(t => t.id !== id);
    notify();
  };

  return { toasts, dismiss };
}

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  info: AlertCircle,
};

const colors: Record<ToastType, string> = {
  success: 'border-emerald-500/40 bg-neutral-900',
  error: 'border-rose-500/40 bg-neutral-900',
  info: 'border-blue-500/40 bg-neutral-900',
};

const iconColors: Record<ToastType, string> = {
  success: 'text-emerald-400',
  error: 'text-rose-400',
  info: 'text-blue-400',
};

export function ToastContainer() {
  const { toasts, dismiss } = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-0 right-0 z-[200] flex flex-col items-center gap-2 pointer-events-none px-4">
      {toasts.map(t => {
        const Icon = icons[t.type];
        return (
          <div
            key={t.id}
            className={`max-w-sm w-full flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-xl pointer-events-auto animate-fade-in-down ${colors[t.type]}`}
          >
            <Icon size={16} className={`shrink-0 ${iconColors[t.type]}`} />
            <span className="flex-1 text-sm text-white font-medium">{t.message}</span>
            {t.onUndo && (
              <button
                onClick={t.onUndo}
                className="flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors shrink-0 border border-blue-500/30 rounded-lg px-2 py-1"
              >
                <Undo2 size={11} />
                Undo
              </button>
            )}
            <button onClick={() => dismiss(t.id)} className="text-neutral-500 hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
