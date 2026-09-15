/** @type {import('tailwindcss').Config} */

// ─────────────────────────────────────────────────────────────────────────────
// Gordon College Health Services — design tokens
//
// Two rules govern this file:
//   1. Brand green is an ACCENT, never a mass. The dark chrome (sidebar,
//      overlays) uses `shell` — a near-black that carries a green cast — so the
//      #044B0E seal green stays reserved for active states, primary actions and
//      confirmation. A 250px slab of saturated green is what made the old build
//      read as a template.
//   2. Neutrals are green-tinted, not Tailwind's default cool grays. Cool gray
//      next to a warm institutional green looks dirty; `ink` is sampled to sit
//      on the same hue axis as the seal.
//
// Legacy `gc.*` aliases are kept at the bottom so the ~50 existing components
// keep compiling while they're migrated panel by panel.
// ─────────────────────────────────────────────────────────────────────────────

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        shell: '#0A1A0F',   // sidebar / dark chrome
        canvas: '#F6F8F6',  // app background behind panels

        brand: {
          50: '#EEF7F0',
          100: '#D8EEDC',
          200: '#AFDCB8',
          500: '#35A348',
          600: '#1F8B32',   // interactive green — passes AA on white, unlike #43AF52
          700: '#12712A',
          800: '#0A5A16',
          900: '#044B0E',   // official seal green
          950: '#052C0B',
        },

        ink: {
          50: '#F3F5F3',
          100: '#E8ECE9',   // hairline rules
          200: '#D6DBD7',   // control borders
          300: '#B4BCB6',
          400: '#8D978F',   // placeholder / tertiary
          500: '#6B776F',   // secondary text, labels
          600: '#4A564E',   // body in tables
          700: '#2C3730',
          800: '#1C2620',
          900: '#101A13',   // primary text
        },

        // Status hues: low-chroma and clinical. Tailwind's amber-100/red-100
        // pastels read as consumer-app candy on a medical record.
        signal: {
          'amber-bg': '#FDF6EC', 'amber-ring': '#F0D9B0', amber: '#B4690E',
          'rose-bg': '#FDF2F1', 'rose-ring': '#F2C9C5', rose: '#B42318',
          'slate-bg': '#F4F5F6', 'slate-ring': '#D8DCDE', slate: '#5B6670',
        },

        // ── Legacy aliases ──────────────────────────────────────────────────
        // ~50 components already use gc-green / gc-accent. Pointing them at the
        // new ramp means nothing breaks mid-migration, and the values improve
        // on the way through: gc-accent was #43AF52, which fails AA as small
        // text on white. Delete this block once the last panel is migrated.
        gc: {
          green: {
            DEFAULT: '#044B0E',
            50: '#EEF7F0', 100: '#D8EEDC',
            600: '#0A5A16', 700: '#044B0E', 800: '#052C0B', 900: '#041F07',
          },
          accent: '#12712A',
          student: '#1F8B32',
        },
      },

      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Reserved for institutional moments only: page titles, the sidebar
        // lockup, and the printed letterhead / medical certificate. It is not a
        // decorative display face — it's what makes a printed document read as
        // issued by a college rather than exported from a web app.
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
      },

      // A real scale. Optical letter-spacing tightens as size grows.
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px', letterSpacing: '0.005em' }],
        xs:    ['12px', { lineHeight: '18px' }],
        sm:    ['13px', { lineHeight: '20px' }],
        base:  ['14px', { lineHeight: '22px' }],
        lg:    ['16px', { lineHeight: '24px', letterSpacing: '-0.006em' }],
        xl:    ['20px', { lineHeight: '28px', letterSpacing: '-0.014em' }],
        '2xl': ['26px', { lineHeight: '32px', letterSpacing: '-0.02em' }],
        '3xl': ['34px', { lineHeight: '40px', letterSpacing: '-0.024em' }],
      },

      // Radius encodes hierarchy: controls < cards < panels. One radius on
      // everything is why the old panels all felt like the same object.
      borderRadius: {
        control: '8px',
        card: '12px',
        panel: '20px',
      },

      // Shadows tinted with the brand hue + a baked-in hairline ring, so panels
      // need no `border` class and never double up on edges.
      boxShadow: {
        e1: '0 1px 2px -1px rgba(10,26,15,.10), 0 0 0 1px rgba(10,26,15,.05)',
        e2: '0 2px 4px -2px rgba(10,26,15,.10), 0 6px 16px -8px rgba(10,26,15,.12), 0 0 0 1px rgba(10,26,15,.05)',
        e3: '0 12px 32px -12px rgba(10,26,15,.22), 0 0 0 1px rgba(10,26,15,.06)',
        e4: '0 24px 56px -20px rgba(10,26,15,.30), 0 0 0 1px rgba(10,26,15,.07)',
      },

      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        // Reserved for things that OPEN in response to a click — menus, popovers,
        // modals. Not for page sections.
        popIn: {
          '0%': { opacity: '0', transform: 'scale(.97) translateY(-2px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        sheetUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn .16s ease-out both',
        'pop-in': 'popIn .14s cubic-bezier(.16,1,.3,1) both',
        'sheet-up': 'sheetUp .28s cubic-bezier(.16,1,.3,1) both',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(.4,0,.2,1)',
        out: 'cubic-bezier(.16,1,.3,1)',
      },
    },
  },
  plugins: [],
}
