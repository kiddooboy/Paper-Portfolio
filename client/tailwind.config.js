/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        // ── Gold palette — used for the brand accent across the app ──
        // Buy/gain direction colors stay green; gold replaces the old
        // `#00B386` brand-primary highlight (links, CTAs, chips, etc.).
        gold: {
          50:  '#fdf8e6',
          100: '#fbedb8',
          200: '#f6df85',
          300: '#efce53',
          400: '#e4b933',
          500: '#D4AF37',  // primary gold
          600: '#b08d27',
          700: '#8a6e1e',
          800: '#634f16',
          900: '#3f320d',
        },
        groww: {
          primary: '#D4AF37',     // gold brand accent (was #00B386 green)
          dark: '#0B0F19',
          card: '#1A1F2E',
          cardLight: '#F8F9FB',
          text: '#EAECEF',
          textLight: '#1A1F2E',
          muted: '#8A8F99',
          gain: '#00B386',        // green — buy / positive direction
          loss: '#EB5B3C',
        }
      }
    },
  },
  plugins: [],
}
