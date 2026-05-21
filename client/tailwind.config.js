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
        // 'AppDigits' (JetBrains Mono, digits-only via unicode-range) sits first
        // so every number renders monospaced; letters fall through to Inter.
        sans: ['AppDigits', 'Inter', 'DM Sans', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Remap Tailwind's default `gray` (a cool, blue-tinted grey) to the
        // neutral scale so every dark:bg-gray-* surface and border reads as
        // true black/grey instead of bluish.
        gray: {
          50:  '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        },
        groww: {
          primary: '#00B386',
          dark: '#000000',      // pure-black page background
          card: '#171717',      // near-black neutral card → contrasts on black
          cardLight: '#F8F9FB',
          text: '#EAECEF',
          textLight: '#171717',
          muted: '#8A8F99',
          gain: '#00B386',
          loss: '#EB5B3C',
        }
      }
    },
  },
  plugins: [],
}
