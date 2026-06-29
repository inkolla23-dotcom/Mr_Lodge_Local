/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        lodge: {
          brown: '#472217',
          light: '#FAF6F0',
          accent: '#E2B13C',
          hover: '#c89528',
          textDark: '#3E1E14',
          textBeige: '#EADBC8',
        }
      }
    },
  },
  plugins: [],
}
