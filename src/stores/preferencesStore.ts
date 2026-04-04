import { create } from 'zustand';

function loadPrefs(): { showRir: boolean } {
  try {
    const s = localStorage.getItem('prometheus-prefs');
    return s ? JSON.parse(s) : { showRir: true };
  } catch {
    return { showRir: true };
  }
}

function savePrefs(prefs: { showRir: boolean }) {
  try {
    localStorage.setItem('prometheus-prefs', JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

interface PreferencesState {
  showRir: boolean;
  setShowRir: (v: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  showRir: loadPrefs().showRir,
  setShowRir: (v) => {
    savePrefs({ showRir: v });
    set({ showRir: v });
  },
}));
