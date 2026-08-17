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
          student: '#4FAD32' // bright green background used on the Student login screen
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        panel: '2.5rem'
      }
    }
  },
  plugins: []
}
