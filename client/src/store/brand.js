// import { create } from 'zustand'

// /**
//  * Brand store — fetches and caches the about_us plugin config.
//  * After load, automatically updates document.title and the browser favicon.
//  */
// export const useBrand = create((set, get) => ({
//   appName:     'Attendix',
//   tagline:     'Attendance & Payroll Simplified',
//   logoUrl:     '',
//   companyName: '',
//   version:     '',
//   loaded:      false,

//   load: async () => {
//     if (get().loaded) return
//     try {
//       const res = await fetch('/api/about')
//       if (!res.ok) return
//       const { data } = await res.json()
//       if (!data) return

//       const appName     = data.appName     || 'Attendix'
//       const tagline     = data.tagline     || 'Attendance & Payroll Simplified'
//       const logoUrl     = data.logoUrl     || ''
//       const companyName = data.companyName || ''
//       const version     = data.version     || ''

//       set({ appName, tagline, logoUrl, companyName, version, loaded: true })

//       // ── Update browser tab title ──────────────────────────────────────────
//       document.title = tagline ? `${appName} — ${tagline}` : appName

//       // ── Update favicon to brand logo (or fall back to emoji) ──────────────
//       const faviconHref = logoUrl
//         ? logoUrl
//         : `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔐</text></svg>`

//       let link = document.querySelector("link[rel~='icon']")
//       if (!link) {
//         link = document.createElement('link')
//         link.rel = 'icon'
//         document.head.appendChild(link)
//       }
//       link.type = logoUrl ? 'image/png' : 'image/svg+xml'
//       link.href = faviconHref

//     } catch { /* silently fall back to defaults */ }
//   },
// }))

import { create } from 'zustand'
import defaultLogo from '../assets/none.png'

/**
 * Brand store — fetches and caches the about_us plugin config.
 * After load, automatically updates document.title and the browser favicon.
 */
export const useBrand = create((set, get) => ({
  appName: 'Attendix',
  tagline: 'Attendance & Payroll Simplified',
  logoUrl: '',
  companyName: '',
  version: '',
  loaded: false,

  load: async (force = false) => {
    if (get().loaded && !force) return
    try {
      const base = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${base}/api/about`)
      if (!res.ok) return
      const { data } = await res.json()
      if (!data) return

      const appName = data.appName || 'Attendix'
      const tagline = data.tagline || 'Attendance & Payroll Simplified'
      const logoUrl = data.logoUrl || ''
      const companyName = data.companyName || ''
      const version = data.version || ''

      set({ appName, tagline, logoUrl, companyName, version, loaded: true })

      // ── Update browser tab title ──────────────────────────────────────────
      document.title = tagline ? `${appName} — ${tagline}` : appName

      // ── Update favicon to brand logo (or fall back to none.png) ──────────
      const faviconHref = logoUrl || defaultLogo

      let link = document.querySelector("link[rel~='icon']")
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.type = 'image/png'
      link.href = faviconHref

    } catch { /* silently fall back to defaults */ }
  },
}))