interface UnitToggleProps {
  label: string;
  value: string;
  options: [string, string];
  onChange: (value: string) => void;
}

export default function UnitToggle({ label, value, options, onChange }: UnitToggleProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-neutral-300">{label}</span>
      <div className="flex rounded-xl overflow-hidden border border-neutral-800">
        {options.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`min-h-11 px-4 text-sm font-medium transition-colors
              ${value === option ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400'}`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
