import { fillForTone, muscleTone, mannequinShouldShowBack, mannequinShouldShowFront, MANNEQUIN_IDLE, MANNEQUIN_STROKE } from '../../lib/exerciseMannequin';

interface Props {
  primary: readonly string[];
  secondary: readonly string[];
  className?: string;
}

function Region({
  id, d, primary, secondary,
}: {
  id: string;
  d: string;
  primary: readonly string[];
  secondary: readonly string[];
}) {
  const tone = muscleTone(id, primary, secondary);
  return (
    <path
      data-muscle-id={id}
      data-muscle-tone={tone}
      d={d}
      fill={fillForTone(tone)}
      stroke={MANNEQUIN_STROKE}
      strokeWidth="1"
    />
  );
}

function Front({ primary, secondary }: { primary: readonly string[]; secondary: readonly string[] }) {
  const p = { primary, secondary };
  return (
    <svg viewBox="0 0 120 280" className="w-full h-full" aria-hidden>
      {/* Body (white mannequin) */}
      <ellipse cx="60" cy="22" rx="16" ry="18" fill={MANNEQUIN_IDLE} stroke={MANNEQUIN_STROKE} strokeWidth="1.2" />
      <path d="M42 42 C42 38 78 38 78 42 L84 78 L36 78 Z" fill={MANNEQUIN_IDLE} stroke={MANNEQUIN_STROKE} strokeWidth="1.2" />
      <rect x="40" y="76" width="40" height="58" rx="8" fill={MANNEQUIN_IDLE} stroke={MANNEQUIN_STROKE} strokeWidth="1.2" />
      <path d="M40 132 L38 268 L52 268 L58 134 Z" fill={MANNEQUIN_IDLE} stroke={MANNEQUIN_STROKE} strokeWidth="1.2" />
      <path d="M80 132 L82 268 L68 268 L62 134 Z" fill={MANNEQUIN_IDLE} stroke={MANNEQUIN_STROKE} strokeWidth="1.2" />
      <path d="M36 50 L8 118 L22 124 L42 72 Z" fill={MANNEQUIN_IDLE} stroke={MANNEQUIN_STROKE} strokeWidth="1.2" />
      <path d="M84 50 L112 118 L98 124 L78 72 Z" fill={MANNEQUIN_IDLE} stroke={MANNEQUIN_STROKE} strokeWidth="1.2" />

      <Region id="front_delts" d="M38 48 C32 52 28 62 30 70 C36 66 42 58 44 52 Z" {...p} />
      <Region id="front_delts" d="M82 48 C88 52 92 62 90 70 C84 66 78 58 76 52 Z" {...p} />
      <Region id="shoulders" d="M34 46 C28 50 26 58 28 64 L36 58 Z" {...p} />
      <Region id="side_delts" d="M28 54 C22 62 20 72 24 78 C30 70 34 62 34 56 Z" {...p} />
      <Region id="side_delts" d="M92 54 C98 62 100 72 96 78 C90 70 86 62 86 56 Z" {...p} />
      <Region id="upper_chest" d="M44 50 C50 46 70 46 76 50 L74 62 C68 58 52 58 46 62 Z" {...p} />
      <Region id="chest" d="M42 60 C50 56 70 56 78 60 L76 78 C68 72 52 72 44 78 Z" {...p} />
      <Region id="lower_chest" d="M44 76 C52 72 68 72 76 76 L74 86 C66 82 54 82 46 86 Z" {...p} />
      <Region id="biceps" d="M22 72 C16 84 14 98 18 108 C26 100 30 86 28 76 Z" {...p} />
      <Region id="biceps" d="M98 72 C104 84 106 98 102 108 C94 100 90 86 92 76 Z" {...p} />
      <Region id="forearms" d="M16 108 C12 118 10 128 14 136 C22 128 24 116 22 110 Z" {...p} />
      <Region id="forearms" d="M104 108 C108 118 110 128 106 136 C98 128 96 116 98 110 Z" {...p} />
      <Region id="core" d="M50 86 C56 84 64 84 70 86 L68 128 C62 124 58 124 52 128 Z" {...p} />
      <Region id="obliques" d="M42 88 C46 90 48 110 46 128 L40 124 C40 108 40 94 42 88 Z" {...p} />
      <Region id="obliques" d="M78 88 C74 90 72 110 74 128 L80 124 C80 108 80 94 78 88 Z" {...p} />
      <Region id="hip_flexors" d="M48 128 C54 126 58 132 56 140 L50 140 Z" {...p} />
      <Region id="hip_flexors" d="M72 128 C66 126 62 132 64 140 L70 140 Z" {...p} />
      <Region id="quadriceps" d="M40 140 C46 138 54 140 56 168 L52 220 C46 210 42 180 40 150 Z" {...p} />
      <Region id="quadriceps" d="M80 140 C74 138 66 140 64 168 L68 220 C74 210 78 180 80 150 Z" {...p} />
      <Region id="adductors" d="M52 150 C56 148 58 170 56 190 L50 188 C50 168 50 154 52 150 Z" {...p} />
      <Region id="adductors" d="M68 150 C64 148 62 170 64 190 L70 188 C70 168 70 154 68 150 Z" {...p} />
      <Region id="abductors" d="M38 148 C36 160 36 180 40 198 L46 190 C42 170 42 156 38 148 Z" {...p} />
      <Region id="abductors" d="M82 148 C84 160 84 180 80 198 L74 190 C78 170 78 156 82 148 Z" {...p} />
    </svg>
  );
}

function Back({ primary, secondary }: { primary: readonly string[]; secondary: readonly string[] }) {
  const p = { primary, secondary };
  return (
    <svg viewBox="0 0 120 280" className="w-full h-full" aria-hidden>
      <ellipse cx="60" cy="22" rx="16" ry="18" fill={MANNEQUIN_IDLE} stroke={MANNEQUIN_STROKE} strokeWidth="1.2" />
      <path d="M42 42 C42 38 78 38 78 42 L84 78 L36 78 Z" fill={MANNEQUIN_IDLE} stroke={MANNEQUIN_STROKE} strokeWidth="1.2" />
      <rect x="40" y="76" width="40" height="58" rx="8" fill={MANNEQUIN_IDLE} stroke={MANNEQUIN_STROKE} strokeWidth="1.2" />
      <path d="M40 132 L38 268 L52 268 L58 134 Z" fill={MANNEQUIN_IDLE} stroke={MANNEQUIN_STROKE} strokeWidth="1.2" />
      <path d="M80 132 L82 268 L68 268 L62 134 Z" fill={MANNEQUIN_IDLE} stroke={MANNEQUIN_STROKE} strokeWidth="1.2" />
      <path d="M36 50 L8 118 L22 124 L42 72 Z" fill={MANNEQUIN_IDLE} stroke={MANNEQUIN_STROKE} strokeWidth="1.2" />
      <path d="M84 50 L112 118 L98 124 L78 72 Z" fill={MANNEQUIN_IDLE} stroke={MANNEQUIN_STROKE} strokeWidth="1.2" />

      <Region id="traps" d="M48 42 C54 40 66 40 72 42 L70 58 C64 54 56 54 50 58 Z" {...p} />
      <Region id="rear_delts" d="M36 48 C30 54 28 64 32 72 C38 66 42 58 42 52 Z" {...p} />
      <Region id="rear_delts" d="M84 48 C90 54 92 64 88 72 C82 66 78 58 78 52 Z" {...p} />
      <Region id="rotator_cuff" d="M40 56 C36 62 36 70 40 76 C44 70 44 62 42 58 Z" {...p} />
      <Region id="rotator_cuff" d="M80 56 C84 62 84 70 80 76 C76 70 76 62 78 58 Z" {...p} />
      <Region id="rhomboids" d="M50 58 C56 54 64 54 70 58 L68 78 C62 74 58 74 52 78 Z" {...p} />
      <Region id="lats" d="M42 70 C36 84 36 104 42 118 L50 110 C48 94 48 80 50 72 Z" {...p} />
      <Region id="lats" d="M78 70 C84 84 84 104 78 118 L70 110 C72 94 72 80 70 72 Z" {...p} />
      <Region id="triceps" d="M20 74 C14 88 12 104 16 114 C24 104 28 88 26 78 Z" {...p} />
      <Region id="triceps" d="M100 74 C106 88 108 104 104 114 C96 104 92 88 94 78 Z" {...p} />
      <Region id="lower_back" d="M50 108 C56 104 64 104 70 108 L68 132 C62 128 58 128 52 132 Z" {...p} />
      <Region id="glutes" d="M42 132 C50 128 58 128 60 148 C58 156 50 156 44 148 Z" {...p} />
      <Region id="glutes" d="M78 132 C70 128 62 128 60 148 C62 156 70 156 76 148 Z" {...p} />
      <Region id="hamstrings" d="M40 156 C46 154 54 156 56 190 L52 230 C46 214 42 180 40 164 Z" {...p} />
      <Region id="hamstrings" d="M80 156 C74 154 66 156 64 190 L68 230 C74 214 78 180 80 164 Z" {...p} />
      <Region id="calves" d="M40 230 C46 228 52 232 52 250 L48 266 C44 258 42 242 40 234 Z" {...p} />
      <Region id="calves" d="M80 230 C74 228 68 232 68 250 L72 266 C76 258 78 242 80 234 Z" {...p} />
    </svg>
  );
}

export default function ExerciseMuscleMannequin({ primary, secondary, className = '' }: Props) {
  const showFront = mannequinShouldShowFront(primary, secondary);
  const showBack = mannequinShouldShowBack(primary, secondary);
  const both = showFront && showBack;

  return (
    <div className={`flex items-end justify-center gap-3 ${className}`} data-mannequin="true">
      {showFront && (
        <div className={both ? 'w-1/2 max-w-[140px]' : 'w-full max-w-[160px]'} data-mannequin-view="front">
          <Front primary={primary} secondary={secondary} />
        </div>
      )}
      {showBack && (
        <div className={both ? 'w-1/2 max-w-[140px]' : 'w-full max-w-[160px]'} data-mannequin-view="back">
          <Back primary={primary} secondary={secondary} />
        </div>
      )}
    </div>
  );
}
