/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0a0a0a',
        'bg-surface': '#f7f5f0',
        'bg-elevated': '#eae7e0',
        'border-default': '#d4d0c8',
        'text-primary': '#1a1a1a',
        'text-secondary': '#6b6b6b',
        'text-muted': '#999999',
        'accent': '#448e0d',
        'accent-hover': '#56a811',
        'error': '#dc2626',
        'warning': '#d97706',
        'eval-white': '#f7f5f0',
        'eval-black': '#0a0a0a',
        'board-light': '#f0e6c8',
        'board-dark': '#448e0d',
      },
      fontFamily: {
        ui: ['Nunito', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'Courier New', 'monospace'],
      },
      borderRadius: {
        none: '0px',
        DEFAULT: '20px',
        sm: '12px',
        md: '16px',
        lg: '20px',
        xl: '24px',
        '2xl': '28px',
        '3xl': '32px',
        full: '9999px',
      },
    },
  },
  plugins: [],
}
