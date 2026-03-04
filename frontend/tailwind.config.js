/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0a0a0a',
        'bg-surface': '#141414',
        'bg-elevated': '#1e1e1e',
        'border-default': '#2a2a2a',
        'text-primary': '#e8e8e8',
        'text-secondary': '#888888',
        'text-muted': '#555555',
        'accent': '#769656',
        'accent-hover': '#8aaa6a',
        'error': '#cc4444',
        'warning': '#b8860b',
        'eval-white': '#e8e8e8',
        'eval-black': '#1a1a1a',
        'board-light': '#eeeed2',
        'board-dark': '#769656',
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
