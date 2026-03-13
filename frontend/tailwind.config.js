/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0f172a',
        'bg-surface': '#1e293b',
        'bg-elevated': '#334155',
        'border-default': '#475569',
        'text-primary': '#f1f5f9',
        'text-secondary': '#94a3b8',
        'text-muted': '#64748b',
        'accent': '#22d3ee',
        'accent-hover': '#67e8f9',
        'error': '#f87171',
        'warning': '#fbbf24',
        'eval-white': '#f1f5f9',
        'eval-black': '#0f172a',
        'board-light': '#e2e8f0',
        'board-dark': '#475569',
      },
      fontFamily: {
        ui: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'Courier New', 'monospace'],
      },
      borderRadius: {
        none: '0px',
        DEFAULT: '0px',
        sm: '0px',
        md: '0px',
        lg: '0px',
        xl: '0px',
        '2xl': '0px',
        full: '9999px',
      },
    },
  },
  plugins: [],
}
