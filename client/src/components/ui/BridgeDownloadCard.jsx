import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Wifi, Monitor, Package, HardDrive, Sparkles } from 'lucide-react'

export default function BridgeDownloadCard() {
  const [info, setInfo]   = useState(null)  // null=loading, false=not configured, {...}=ready
  const [busy, setBusy]   = useState(false)
  const [done, setDone]   = useState(false)

  useEffect(() => {
    fetch('/bridge-app/info')
      .then(r => r.json())
      .then(d => setInfo(d.configured ? d : false))
      .catch(() => setInfo(false))
  }, [])

  // Not configured — render nothing
  if (info === false || info === null) return null

  function handleDownload() {
    if (!info.downloadUrl || busy) return
    setBusy(true)
    const a = document.createElement('a')
    a.href = info.downloadUrl
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => { setBusy(false); setDone(true) }, 800)
    setTimeout(() => setDone(false), 4000)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 }}
      style={{
        borderRadius: 14,
        border: '1px solid var(--accent-border)',
        background: 'color-mix(in srgb, var(--accent) 6%, var(--bg-surface2))',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '11px 14px',
        borderBottom: '1px solid var(--border-soft)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Wifi size={14} style={{ color: 'var(--accent)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Bridge App
            </span>
            {info.version && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '1px 7px', borderRadius: 99,
                background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.25)',
                fontSize: '0.6rem', fontWeight: 800, color: '#22c55e', letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}>
                <Sparkles size={8} /> v{info.version}
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1 }}>
            Windows desktop app to sync biometric devices
          </p>
        </div>
      </div>

      {/* Info chips */}
      <div style={{ padding: '10px 14px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          info.version    && { icon: Package,   label: `v${info.version}` },
          info.fileSizeMb && { icon: HardDrive, label: info.fileSizeMb },
          { icon: Monitor, label: 'Windows 10/11' },
        ].filter(Boolean).map((chip, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', borderRadius: 99,
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)',
          }}>
            <chip.icon size={11} style={{ color: 'var(--accent)' }} />
            {chip.label}
          </span>
        ))}
      </div>

      {/* Download button */}
      <div style={{ padding: '10px 14px 12px' }}>
        <motion.button
          onClick={handleDownload}
          disabled={busy}
          whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.975 }}
          style={{
            width: '100%', padding: '11px 16px', borderRadius: 10,
            border: 'none', cursor: busy ? 'wait' : 'pointer',
            fontWeight: 700, fontSize: '0.875rem',
            background: done ? 'rgba(34,197,94,.15)' : 'var(--accent)',
            color: done ? '#22c55e' : '#fff',
            border: done ? '1px solid rgba(34,197,94,.3)' : 'none',
            boxShadow: done ? 'none' : '0 4px 16px var(--accent-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: busy ? 0.7 : 1, transition: 'all .25s',
          }}>
          <Download size={15} />
          {done ? 'Download started!' : busy ? 'Opening…' : 'Download Bridge App'}
        </motion.button>

        {info.changelog && (
          <p style={{
            marginTop: 8, fontSize: '0.72rem', color: 'var(--text-dim)',
            lineHeight: 1.5, paddingLeft: 2,
          }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>What's new: </span>
            {info.changelog}
          </p>
        )}
      </div>
    </motion.div>
  )
}
