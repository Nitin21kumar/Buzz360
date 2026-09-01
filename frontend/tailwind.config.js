
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    screens: {


      mobile: { max: '860px' },
      tablet: { max: '1180px' },
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {


        app: 'var(--bg-app)',
        sidebar: 'var(--bg-sidebar)',
        card: 'var(--bg-card)',
        'card-glass': 'var(--card-glass)',
        'navbar-glass': 'var(--navbar-glass)',
        border: 'var(--border)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-inverse': 'var(--text-inverse)',
        'row-hover': 'var(--row-hover)',
        'track-bg': 'var(--track-bg)',

        purple: { DEFAULT: 'var(--accent-purple)', soft: 'var(--accent-purple-soft)' },
        teal: { DEFAULT: 'var(--accent-teal)', soft: 'var(--accent-teal-soft)' },
        blue: { DEFAULT: 'var(--accent-blue)', soft: 'var(--accent-blue-soft)' },
        success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)' },
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
        warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' },
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        card: 'var(--radius)',
      },
      boxShadow: {
        card: 'var(--shadow)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'sans-serif'],
      },
      keyframes: {
        spin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'dot-blink': {
          '0%, 80%, 100%': { opacity: 0.2, transform: 'scale(0.85)' },
          '40%': { opacity: 1, transform: 'scale(1)' },
        },
        'bar-bounce': {
          '0%, 100%': { height: '30%', opacity: 0.6 },
          '50%': { height: '100%', opacity: 1 },
        },
        'under-dev-float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'under-dev-twinkle': {
          '0%, 100%': { opacity: 0.4, transform: 'scale(0.85)' },
          '50%': { opacity: 1, transform: 'scale(1.1)' },
        },
        'search-slide-down': {
          from: { opacity: 0, transform: 'translateY(-8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        'dot-blink': 'dot-blink 1.1s infinite ease-in-out',
        'bar-bounce': 'bar-bounce 1s ease-in-out infinite',
        'under-dev-float': 'under-dev-float 3.2s ease-in-out infinite',
        'under-dev-twinkle': 'under-dev-twinkle 2s ease-in-out infinite',
        'search-slide-down': 'search-slide-down 0.18s ease-out',
      },
    },
  },
  plugins: [],
}
