/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        page: '#000000',
        surface: {
          DEFAULT: '#0a0a0a',
          raised: '#171717',
          hover: '#262626',
        },
        overlay: 'rgba(0,0,0,0.72)',
        ink: {
          DEFAULT: '#f8fafc',
          secondary: '#a3a3a3',
          muted: '#737373',
          disabled: '#525252',
        },
        line: {
          DEFAULT: '#262626',
          subtle: '#1f1f1f',
          focus: '#60a5fa',
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
