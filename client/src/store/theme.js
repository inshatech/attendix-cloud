import { create } from 'zustand'

// Default: use stored preference, fall back to OS preference, then dark
function getDefault() {
  const stored = localStorage.getItem('theme')
  if (stored) return stored
  // Detect OS dark/light mode
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  return 'dark'
}

const initial = getDefault()

export const useTheme = create((set) => ({
  theme: initial,
  toggle: () => set(s => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    document.documentElement.setAttribute('data-theme', next)
    return { theme: next }
  }),
  setTheme: (t) => {
    localStorage.setItem('theme', t)
    document.documentElement.setAttribute('data-theme', t)
    set({ theme: t })
  },
}))

// Apply immediately on load
document.documentElement.setAttribute('data-theme', initial)
