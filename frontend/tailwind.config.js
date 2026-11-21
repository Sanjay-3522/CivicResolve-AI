/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        civic: {
          blue: '#1E40AF',
          green: '#15803D',
          red: '#DC2626',
          orange: '#D97706',
          yellow: '#CA8A04',
        },
      },
    },
  },
  plugins: [],
}
