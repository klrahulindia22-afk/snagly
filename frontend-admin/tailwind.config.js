/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        accent:   '#0f9e8e',
        'nav-bg': '#006452',
        'side-bg':'#052f2a',
        'app-bg': '#0d1f1d',
      },
    },
  },
  plugins: [],
}
