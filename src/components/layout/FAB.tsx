import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Dumbbell, Scale, Flame, X } from 'lucide-react';

interface FABAction {
  label: string;
  icon: typeof Dumbbell;
  onClick: () => void;
}

export default function FAB() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const actions: FABAction[] = [
    { label: 'Add Workout', icon: Dumbbell, onClick: () => { navigate('/workout'); setOpen(false); } },
    { label: 'Add Weight', icon: Scale, onClick: () => { navigate('/weight?log=1'); setOpen(false); } },
    { label: 'Add Meal', icon: Flame, onClick: () => { navigate('/nutrition?add=1'); setOpen(false); } },
  ];

  return (
    <>
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="md:hidden fixed bottom-[68px] left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
        {open && (
          <div className="flex flex-col items-center gap-2 mb-1 animate-fade-in-up">
            {actions.map((action, i) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  className="flex items-center gap-3 bg-neutral-900 border border-neutral-700 rounded-full pl-4 pr-5 py-3 shadow-xl hover:bg-neutral-800 hover:border-neutral-600 transition-all active:scale-95"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center">
                    <Icon size={14} className="text-blue-400" />
                  </div>
                  <span className="text-sm font-medium text-white whitespace-nowrap">{action.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={() => setOpen(o => !o)}
          className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 active:scale-95
            ${open ? 'bg-neutral-800 border border-neutral-600 rotate-45' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40'}`}
        >
          {open ? <X size={22} className="text-white" /> : <Plus size={22} className="text-white" />}
        </button>
      </div>
    </>
  );
}
