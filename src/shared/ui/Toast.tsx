import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, AlertCircle, X, Undo2 } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  onUndo?: () => void;
}

const MAX_TOASTS = 3;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

let toastQueue: ToastMessage[] = [];
let listeners: ((toasts: ToastMessage[]) => void)[] = [];

function notify() {
  listeners.forEach(fn => fn([...toastQueue]));
}

function scheduleDismiss(id: string, ms: number) {
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.set(id, setTimeout(() => {
    toastQueue = toastQueue.filter(t => t.id !== id);
    timers.delete(id);
    notify();
  }, ms));
}

function durationFor(type: ToastType, extra = 0) {
  return (type === 'error' || extra > 80 ? 8000 : 4000);
}

export function toast(message: string, type: ToastType = 'success') {
  const id = crypto.randomUUID();
  toastQueue = [...toastQueue, { id, message, type }].slice(-MAX_TOASTS);
  notify();
  scheduleDismiss(id, durationFor(type, message.length));
}

export function toastWithUndo(message: string, onUndo: () => void) {
  const id = crypto.randomUUID();
  const wrappedUndo = () => {
    // Dismiss toast immediately when undo is clicked
    toastQueue = toastQueue.filter(t => t.id !== id);
    notify();
    onUndo();
  };
  const next: ToastMessage = { id, message, type: 'info', onUndo: wrappedUndo };
  toastQueue = [...toastQueue, next].slice(-MAX_TOASTS);
  notify();
  scheduleDismiss(id, 8000);
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
  const { t: translate } = useTranslation();
  const { toasts, dismiss } = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-0 right-0 z-[200] flex flex-col items-center gap-2 pointer-events-none px-4">
      {toasts.map(t => {
        const Icon = icons[t.type];
        return (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            aria-live={t.type === 'error' ? 'assertive' : 'polite'}
            onMouseEnter={() => {
              const existing = timers.get(t.id);
              if (existing) clearTimeout(existing);
            }}
            onMouseLeave={() => scheduleDismiss(t.id, durationFor(t.type, t.message.length))}
            className={`max-w-sm w-full flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-xl pointer-events-auto animate-fade-in-down ${colors[t.type]}`}
          >
            <Icon aria-hidden="true" size={16} className={`shrink-0 ${iconColors[t.type]}`} />
            <span className="flex-1 min-w-0 text-sm text-white font-medium [overflow-wrap:anywhere]">{t.message}</span>
            {t.onUndo && (
              <button
                type="button"
                onClick={t.onUndo}
                className="min-h-11 min-w-11 flex items-center justify-center gap-1 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors shrink-0 border border-blue-500/30 rounded-lg px-2 py-1"
              >
                <Undo2 aria-hidden="true" size={11} />
                {translate('common.undo')}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label={translate('common.close')}
              className="min-h-11 min-w-11 shrink-0 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <X aria-hidden="true" size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
