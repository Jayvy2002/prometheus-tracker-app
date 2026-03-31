import { useRef, useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';

interface DateInputProps {
  value: string;
  onChange: (dateStr: string) => void;
}

function toDisplay(dateStr: string): string {
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${now.getFullYear()}`;
}

function parseDisplay(display: string): string | null {
  const cleaned = display.replace(/[.\-\s]/g, '/');
  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  if (year < 2000 || year > 2099) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return null;
  const iso = `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00`;
  return iso;
}

export default function DateInput({ value, onChange }: DateInputProps) {
  const [text, setText] = useState(() => toDisplay(value));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (!focused && value !== prevValueRef.current) {
      setText(toDisplay(value));
      setError(false);
    }
    prevValueRef.current = value;
  }, [value, focused]);

  const handleFocus = () => {
    setFocused(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseDisplay(text);
    if (parsed) {
      setError(false);
      onChange(parsed);
    } else {
      setError(true);
      setText(toDisplay(value));
      setTimeout(() => setError(false), 1500);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    }
  };

  return (
    <div
      className={`flex items-center gap-3 bg-neutral-900/60 rounded-xl p-3 border transition-colors ${
        error
          ? 'border-red-500/70'
          : focused
            ? 'border-neutral-600'
            : 'border-neutral-800/50'
      }`}
    >
      <Calendar size={16} className={`shrink-0 ${error ? 'text-red-400' : 'text-neutral-400'}`} />
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={text}
        onChange={e => setText(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="JJ/MM/AAAA"
        className="bg-transparent text-white text-sm focus:outline-none focus:ring-0 border-0 p-0 font-mono w-full"
      />
    </div>
  );
}
