import { create } from 'zustand';

export type WorkoutPrefs = {
  showRir: boolean;
  autoStartRest: boolean;
};

function defaults(): WorkoutPrefs {
  return { showRir: true, autoStartRest: true };
}

function loadPrefs(): WorkoutPrefs {
  try {
    const s = localStorage.getItem('prometheus-prefs');
    if (!s) return defaults();
    const parsed = JSON.parse(s) as Partial<WorkoutPrefs>;
    return {
      showRir: parsed.showRir !== false,
      autoStartRest: parsed.autoStartRest !== false,
    };
  } catch {
    return defaults();
  }
}

function savePrefs(prefs: WorkoutPrefs) {
  try {
    localStorage.setItem('prometheus-prefs', JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

interface PreferencesState extends WorkoutPrefs {
  setShowRir: (v: boolean) => void;
  setAutoStartRest: (v: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  ...loadPrefs(),
  setShowRir: (v) => {
    savePrefs({ showRir: v, autoStartRest: get().autoStartRest });
    set({ showRir: v });
  },
  setAutoStartRest: (v) => {
    savePrefs({ showRir: get().showRir, autoStartRest: v });
    set({ autoStartRest: v });
  },
}));
