import { Pause, Play } from 'lucide-react';
import { formatDuration } from '../../lib/utils';

interface Props {
  elapsedSeconds: number;
  running: boolean;
  onToggle: () => void;
}

export default function SessionTimer({ elapsedSeconds, running, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold tabular-nums transition-colors
        ${running ? 'bg-blue-600/20 text-blue-300' : 'bg-neutral-900 text-neutral-400 hover:text-white'}`}
    >
      {running ? <Pause size={12} /> : <Play size={12} />}
      {formatDuration(elapsedSeconds)}
    </button>
  );
}
