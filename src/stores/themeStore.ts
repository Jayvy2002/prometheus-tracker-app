import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  if (theme === 'dark') {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
}

// Synchronously read + apply the theme before any React render (no flash)
const savedTheme: Theme =
  (localStorage.getItem('prometheus_theme') as Theme) === 'light' ? 'light' : 'dark';

applyTheme(savedTheme);

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: savedTheme,

  setTheme: (theme: Theme) => {
    applyTheme(theme);
    localStorage.setItem('prometheus_theme', theme);
    set({ theme });
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
}));
