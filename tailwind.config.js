/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
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
