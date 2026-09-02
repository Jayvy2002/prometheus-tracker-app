/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
          label: 'var(--chart-label)',
          grid: 'var(--chart-grid)',
          tooltip: {
            foreground: 'var(--chart-tooltip-foreground)',
            background: 'var(--chart-tooltip-background)',
            muted: 'var(--chart-tooltip-muted)',
          },
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
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
  plugins: [require('tailwindcss-animate')],
};
