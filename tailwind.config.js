import plugin from 'tailwindcss/plugin';
import { tailwindColors, themeBaseStyles } from './src/shared/theme/palette.ts';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Every colour is a CSS variable (dark by default, light under
      // html[data-theme="light"]). Values and contrast notes: src/shared/theme/palette.ts
      // and docs/DESIGN_SYSTEM.md.
      colors: tailwindColors(),
      keyframes: {
        'scan-line': {
          '0%, 100%': { transform: 'translateY(-24px)', opacity: '0.6' },
          '50%': { transform: 'translateY(24px)', opacity: '1' },
        },
        'ping-once': {
          '0%': { opacity: '0.4' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'scan-line': 'scan-line 1.6s ease-in-out infinite',
        'ping-once': 'ping-once 0.3s ease-out forwards',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase(themeBaseStyles());
    }),
  ],
};
