import { create } from 'zustand'
import axios from 'axios'
import api from '../lib/api'

const BASE = import.meta.env.VITE_API_URL || ''

export const useAuth = create((set, get) => ({
  user: null, ready: false,

  init: async () => {
    const at = sessionStorage.getItem('at')
    const rt = localStorage.getItem('rt')

    // No tokens at all — not logged in
    if (!at && !rt) { set({ ready: true }); return }

    // Have access token — try it directly
    if (at) {
      try {
        const r = await api.get('/auth/me')
        set({ user: r.data, ready: true })
        return
      } catch {
        // Access token invalid/expired — fall through to try refresh
      }
    }

    // No access token (page refresh) OR access token failed — try refresh token
    if (rt) {
      try {
        const res = await axios.post(`${BASE}/auth/refresh`, { refreshToken: rt })
        sessionStorage.setItem('at', res.data.accessToken)
        localStorage.setItem('rt', res.data.refreshToken)
        // Now fetch user with the new token
        const r = await api.get('/auth/me')
        set({ user: r.data, ready: true })
        return
      } catch {
        // Refresh token also invalid — clear everything
        sessionStorage.clear()
        localStorage.clear()
      }
    }

    set({ user: null, ready: true })
  },

  setUser: (user, at, rt) => {
    sessionStorage.setItem('at', at)
    if (rt) localStorage.setItem('rt', rt)
    set({ user })
  },

  patchUser: (patch) => set(s => ({ user: s.user ? { ...s.user, ...patch } : s.user })),

  logout: async () => {
    try { await api.post('/auth/logout', { refreshToken: localStorage.getItem('rt') }) } catch {}
    sessionStorage.clear()
    localStorage.clear()
    set({ user: null })
    window.location.href = '/login'
  },

  isAdmin:   () => get().user?.role === 'admin',
  isSupport: () => get().user?.role === 'support',
}))