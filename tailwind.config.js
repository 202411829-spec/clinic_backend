/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Gordon College brand palette, sampled directly from the official mockups
        gc: {
          green: {
            DEFAULT: '#044B0E', // primary brand green — header bg, buttons
            50: '#E9F5EC',
            100: '#C9E8CF',
            600: '#0A5A16',
            700: '#044B0E',
            800: '#033A0B',
            900: '#022607'
          },
          accent: '#43AF52', // portal eyebrow label green; also the Student login button color
          student: '#4FAD32' // bright green background used on the Student login screen and sidebar
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        panel: '2.5rem'
      },
      keyframes: {
        // Subtle, transform/opacity-only keyframes — cheap to animate
        // (no layout/paint thrash), so they stay smooth even on low-end
        // devices and don't add perceptible slowdown to navigation.
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        }
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.28s ease-out both',
        'fade-in': 'fadeIn 0.2s ease-out both',
        'scale-in': 'scaleIn 0.18s ease-out both'
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)'
      }
    }
  },
  plugins: []
}
