/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Greeqs typography — Inter UI, JetBrains Mono for numerics
      fontFamily: {
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        inter: ['Inter', 'system-ui', 'sans-serif'],
        mono:  ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // ── Greeqs semantic tokens ──────────────────────────────────
        // All point at CSS variables defined in index.css, so they
        // automatically switch between the light and dark palette
        // when `.dark` is toggled. Every existing class in the codebase
        // (text-groww-primary, bg-groww-card, text-gain, etc.) is now
        // expressed in OKLCH Greeqs colours via this mapping.

        canvas:    'var(--canvas)',
        surface0:  'var(--surface-0)',
        surface1:  'var(--surface-1)',
        surface2:  'var(--surface-2)',
        surface3:  'var(--surface-3)',

        line:       'var(--line)',
        lineStrong: 'var(--line-strong)',

        fg:   'var(--fg)',
        fg2:  'var(--fg-2)',
        fg3:  'var(--fg-3)',
        fg4:  'var(--fg-4)',

        accent:     'var(--accent)',
        accentSoft: 'var(--accent-soft)',
        accentLine: 'var(--accent-line)',
        up:         'var(--up)',
        upSoft:     'var(--up-soft)',
        upLine:     'var(--up-line)',
        down:       'var(--down)',
        downSoft:   'var(--down-soft)',
        downLine:   'var(--down-line)',
        info:       'var(--info)',
        infoSoft:   'var(--info-soft)',
        infoLine:   'var(--info-line)',

        // Legacy `groww-*` aliases — repointed at Greeqs tokens so
        // every existing class re-skins without per-file edits.
        groww: {
          primary:   'var(--accent)',
          dark:      'var(--canvas)',
          card:      'var(--surface-1)',
          cardLight: 'var(--surface-1)',
          text:      'var(--fg)',
          textLight: 'var(--fg)',
          muted:     'var(--fg-3)',
          gain:      'var(--up)',
          loss:      'var(--down)',
        },

        // Legacy `tv-*` aliases — repointed at Greeqs tokens.
        tv: {
          bg:           'var(--canvas)',
          bgAlt:        'var(--surface-0)',
          card:         'var(--surface-1)',
          cardAlt:      'var(--surface-2)',
          border:       'var(--line)',
          borderStrong: 'var(--line-strong)',
          text:         'var(--fg)',
          textStrong:   'var(--fg)',
          muted:        'var(--fg-3)',
          lightBg:      'var(--canvas)',
          lightBgAlt:   'var(--surface-0)',
          lightCard:    'var(--surface-1)',
          lightBorder:  'var(--line)',
          lightText:    'var(--fg)',
          lightMuted:   'var(--fg-3)',
          green:        'var(--up)',
          greenDark:    'var(--up)',
          red:          'var(--down)',
          redDark:      'var(--down)',
          // Brand blue scale → repointed at info (still distinct from amber accent)
          blue: {
            50:  'var(--info-soft)',
            100: 'var(--info-soft)',
            200: 'var(--info-soft)',
            300: 'var(--info)',
            400: 'var(--info)',
            500: 'var(--info)',
            600: 'var(--info)',
            700: 'var(--info)',
            800: 'var(--info)',
            900: 'var(--info)',
          },
        },

        // Keep the gold palette around (now an alias of accent) so any
        // existing reference still resolves.
        gold: {
          50:  'var(--accent-soft)',  100: 'var(--accent-soft)',
          200: 'var(--accent-soft)',  300: 'var(--accent)',
          400: 'var(--accent)',       500: 'var(--accent)',
          600: 'var(--accent-2, var(--accent))',
          700: 'var(--accent-2, var(--accent))',
          800: 'var(--accent-2, var(--accent))',
          900: 'var(--accent-2, var(--accent))',
        },
      },
      borderRadius: {
        tv: '6px',
      },
      boxShadow: {
        tv: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        'tv-dark': '0 1px 2px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)',
      },
    },
  },
  plugins: [],
}
