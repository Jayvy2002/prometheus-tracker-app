/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Readable greys on the black app background (WCAG AA for small text):
        // 500 ≈ 6.9:1 and 600 ≈ 5.7:1 on #000, ≥ 4.8:1 on the #171717 cards.
        // Borders and fills that need the old darker greys use explicit values.
        neutral: {
          500: '#949494',
          600: '#858585',
        },
        page: '#000000',
        surface: {
          DEFAULT: '#0a0a0a',
          raised: '#171717',
          hover: '#262626',
          active: '#404040',
        },
        elevated: '#171717',
        overlay: 'rgba(0,0,0,0.72)',
        ink: {
          DEFAULT: '#f8fafc',
          secondary: '#a3a3a3',
          muted: '#949494',
          disabled: '#525252',
        },
        line: {
          DEFAULT: '#262626',
          subtle: '#1f1f1f',
          focus: '#60a5fa',
        },
        primary: {
          DEFAULT: '#2563eb',
          hover: '#3b82f6',
        },
        success: {
          DEFAULT: '#16a34a',
          hover: '#22c55e',
        },
        warning: {
          DEFAULT: '#d97706',
          hover: '#f59e0b',
        },
        danger: {
          DEFAULT: '#e11d48',
          hover: '#f43f5e',
          muted: '#fb7185',
        },
      },
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
  plugins: [],
};
