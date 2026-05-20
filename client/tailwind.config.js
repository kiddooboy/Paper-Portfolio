/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // TradingView's UI is set in Trebuchet MS (their signature look) with
      // Inter / Roboto as graceful fallbacks across platforms.
      fontFamily: {
        sans: ['"Trebuchet MS"', 'Inter', 'Roboto', 'system-ui', 'sans-serif'],
        inter: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Roboto Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // ── TradingView palette ─────────────────────────────────────────
        // Brand:  #2962FF (signature TradingView blue)
        // Dark:   #131722 background · #1E222D card · #2A2E39 border
        // Light:  #FFFFFF background · #F8F9FD card · #E0E3EB border
        // Direction: #26A69A green · #EF5350 red
        tv: {
          // Brand blue scale
          blue: {
            50:  '#E8F0FE',
            100: '#C7D9FC',
            200: '#9DBAFA',
            300: '#6E96F6',
            400: '#4576F0',
            500: '#2962FF',   // primary TradingView blue
            600: '#1E53E5',
            700: '#1543BF',
            800: '#0E3399',
            900: '#082673',
          },
          // Dark theme
          bg:           '#131722',
          bgAlt:        '#0D1015',
          card:         '#1E222D',
          cardAlt:      '#262B38',
          border:       '#2A2E39',
          borderStrong: '#363A45',
          text:         '#D1D4DC',
          textStrong:   '#F0F3FA',
          muted:        '#787B86',
          // Light theme
          lightBg:      '#FFFFFF',
          lightBgAlt:   '#F8F9FD',
          lightCard:    '#F8F9FD',
          lightBorder:  '#E0E3EB',
          lightText:    '#131722',
          lightMuted:   '#787B86',
          // Direction
          green:     '#26A69A',
          greenDark: '#00897B',
          red:       '#EF5350',
          redDark:   '#E53935',
        },
        // Legacy `groww-*` aliases — repointed to TradingView tokens so
        // every existing class in the codebase (text-groww-primary, etc.)
        // automatically renders in the TradingView palette.
        groww: {
          primary:   '#2962FF',  // TradingView blue
          dark:      '#131722',
          card:      '#1E222D',
          cardLight: '#F8F9FD',
          text:      '#D1D4DC',
          textLight: '#131722',
          muted:     '#787B86',
          gain:      '#26A69A',  // TV teal-green
          loss:      '#EF5350',  // TV red
        },
        // Keep the `gold` tokens defined so any direct references still
        // resolve (re-pointed to a muted accent — not used as the brand).
        gold: {
          50:  '#fdf8e6', 100: '#fbedb8', 200: '#f6df85', 300: '#efce53',
          400: '#e4b933', 500: '#D4AF37', 600: '#b08d27', 700: '#8a6e1e',
          800: '#634f16', 900: '#3f320d',
        },
      },
      // Tighter radii — TradingView UI uses 2-6px corners
      borderRadius: {
        tv: '4px',
      },
      boxShadow: {
        tv: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        'tv-dark': '0 1px 2px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)',
      },
    },
  },
  plugins: [],
}
