/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#0f9e8e',
        'board-bg': '#0d1f1d',
        'nav-bg': '#052f2a',
      },
    },
  },
  plugins: [],
}

