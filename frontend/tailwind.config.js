/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'vert-fonce': '#0b3d24',
        vert: '#146c43',
        'vert-clair': '#1a8551',
        orange: '#e8871e',
        'orange-clair': '#f5a742',
        bg: '#eef6f1',
        // Système de design repris de l'app existante (sidebar sombre, cartes claires)
        sidebar: '#12181f',
        'sidebar-hover': 'rgba(255,255,255,0.06)',
        teal: '#0d9488',
        'teal-light': '#ccfbf1',
        rose: '#f43f5e',
        'rose-light': '#ffe4e6',
        'purple-badge': '#8b5cf6',
        'purple-light': '#f3e8ff',
        danger: '#ef4444'
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif']
      }
    }
  },
  plugins: []
}
