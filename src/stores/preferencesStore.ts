import { create } from 'zustand';
import {
  applyThemePreference,
  DEFAULT_THEME_PREFERENCE,
  parseThemePreference,
  type ThemePreference,
} from '../shared/theme/theme';

export type WorkoutPrefs = {
  showRir: boolean;
  autoStartRest: boolean;
  keepScreenAwake: boolean;
  /** Device preference, read before the first paint by index.html. */
  theme: ThemePreference;
};

function defaults(): WorkoutPrefs {
  return { showRir: true, autoStartRest: true, keepScreenAwake: true, theme: DEFAULT_THEME_PREFERENCE };
}

function loadPrefs(): WorkoutPrefs {
  try {
    const s = localStorage.getItem('prometheus-prefs');
    if (!s) return defaults();
    const parsed = JSON.parse(s) as Partial<WorkoutPrefs>;
    return {
      showRir: parsed.showRir !== false,
      autoStartRest: parsed.autoStartRest !== false,
      keepScreenAwake: parsed.keepScreenAwake !== false,
      theme: parseThemePreference(parsed.theme),
    };
  } catch {
    return defaults();
  }
}

function savePrefs({ showRir, autoStartRest, keepScreenAwake, theme }: WorkoutPrefs) {
  try {
    localStorage.setItem('prometheus-prefs', JSON.stringify({ showRir, autoStartRest, keepScreenAwake, theme }));
  } catch {
    // ignore
  }
}

interface PreferencesState extends WorkoutPrefs {
  setShowRir: (v: boolean) => void;
  setAutoStartRest: (v: boolean) => void;
  setKeepScreenAwake: (v: boolean) => void;
  setTheme: (v: ThemePreference) => void;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  ...loadPrefs(),
  setShowRir: (v) => {
    savePrefs({ ...get(), showRir: v });
    set({ showRir: v });
  },
  setAutoStartRest: (v) => {
    savePrefs({ ...get(), autoStartRest: v });
    set({ autoStartRest: v });
  },
  setKeepScreenAwake: (v) => {
    savePrefs({ ...get(), keepScreenAwake: v });
    set({ keepScreenAwake: v });
  },
  setTheme: (v) => {
    savePrefs({ ...get(), theme: v });
    set({ theme: v });
    applyThemePreference(v);
  },
}));
