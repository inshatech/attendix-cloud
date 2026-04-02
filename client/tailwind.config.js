/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html','./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink:   { 950:'#05050a', 900:'#0a0a0f', 800:'#0f0f18', 700:'#141421', 600:'#1a1a2e', 500:'#222238' },
        edge:  { DEFAULT:'#1e1e30', soft:'#252538', bright:'#303050' },
        lime:  { 400:'#e8ff47', 500:'#d4eb3c', 600:'#b8cc20' },
        slate: { 600:'#4a4a68', 500:'#5a5a7a', 400:'#7878a0', 300:'#9090b8', 200:'#b0b0cc', 100:'#d0d0e8' },
      },
      fontFamily: { sans:['Inter','system-ui','sans-serif'], mono:['JetBrains Mono','DM Mono','monospace'] },
      backgroundImage: {
        'grid-dark':"linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px)",
      },
      backgroundSize: { grid:'48px 48px' },
      animation: {
        'fade-in':'fadeIn .2s ease','slide-up':'slideUp .25s ease',
        'spin-slow':'spin 2s linear infinite','pulse-slow':'pulse 3s ease-in-out infinite',
        'shimmer':'shimmer 1.5s linear infinite',
      },
      keyframes: {
        fadeIn:  {from:{opacity:0,transform:'translateY(6px)'},to:{opacity:1,transform:'none'}},
        slideUp: {from:{opacity:0,transform:'translateY(16px)'},to:{opacity:1,transform:'none'}},
        shimmer: {from:{backgroundPosition:'-200% 0'},to:{backgroundPosition:'200% 0'}},
      },
      boxShadow: {
        'glow-lime':'0 0 24px rgba(232,255,71,.18)',
        'card':'0 1px 3px rgba(0,0,0,.4)',
        'modal':'0 24px 64px rgba(0,0,0,.6)',
      },
    },
  },
  plugins: [],
}
