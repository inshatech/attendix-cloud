import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { OrgContextBar } from './OrgContextBar'
import { Toaster } from '../ui/Toast'
import { useSidebar } from '../../store/sidebar'
import { useBrand } from '../../store/brand'

// Tawk.to loader — fetches config from backend and injects script
async function loadTawk() {
  if (window.Tawk_API || document.getElementById('tawk-script')) return
  try {
    const res = await fetch('/tawk-config')
    const cfg = await res.json()
    if (!cfg?.enabled || !cfg?.propertyId) return
    window.Tawk_API = window.Tawk_API || {}
    window.Tawk_LoadStart = new Date()
    const s = document.createElement('script')
    s.id  = 'tawk-script'
    s.src = `https://embed.tawk.to/${cfg.propertyId}/${cfg.widgetId || 'default'}`
    s.async = true
    s.charset = 'UTF-8'
    s.setAttribute('crossorigin', '*')
    document.head.appendChild(s)
  } catch {}
}

export function AppShell({ children }) {
  const loc        = useLocation()
  const { open }   = useSidebar()
  const { appName, logoUrl } = useBrand()

  // Admin area doesn't need org/device context bar
  const isAdminArea = loc.pathname.startsWith('/admin')

  useEffect(() => {
    if (!isAdminArea) loadTawk()
  }, [isAdminArea])

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 left-48 w-96 h-96 rounded-full blur-3xl" style={{ background: 'var(--accent-muted)' }} />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full blur-3xl" style={{ background: 'var(--accent-muted)', opacity: 0.6 }} />
        <div className="absolute inset-0 bg-grid-dark bg-grid opacity-100" />
      </div>

      <div style={{ display: 'contents' }}><Sidebar /></div>

      <div className="flex-1 flex flex-col overflow-hidden relative z-10">

        {/* ── Mobile top bar (hidden on md+) ─────────────────────── */}
        <div
          className="md:hidden flex items-center gap-3 px-4"
          style={{
            height: 52, flexShrink: 0,
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <button
            onClick={open}
            style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'var(--bg-surface2)',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
            aria-label="Open menu"
          >
            <Menu size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>

          {/* Brand in mobile bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {logoUrl && (
              <img
                src={logoUrl}
                alt={appName}
                style={{ width: 26, height: 26, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }}
              />
            )}
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {appName}
            </span>
          </div>
        </div>

        {/* Org context bar — only for user workspace pages */}
        {!isAdminArea && <OrgContextBar />}

        <main className="flex-1 overflow-y-auto">
          <motion.div
            key={loc.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {children}
          </motion.div>
        </main>
      </div>

      <Toaster />
    </div>
  )
}
