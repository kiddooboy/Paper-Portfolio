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
        groww: {
          primary: '#00B386',
          dark: '#0A0A0A',
          card: '#171717',
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
