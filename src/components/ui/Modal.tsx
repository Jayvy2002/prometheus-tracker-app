import { type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-modal-overlay"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className={`relative bg-neutral-950 border border-neutral-800/80 rounded-2xl w-full ${sizeMap[size]} max-h-[88vh] overflow-hidden flex flex-col z-10 animate-modal-content shadow-2xl`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800/60 flex-shrink-0">
          {title && <h3 className="text-base font-semibold text-white">{title}</h3>}
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all duration-150 active:scale-90"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-5">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
