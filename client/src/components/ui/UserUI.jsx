import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { SearchBox as _SearchBox } from './SearchBox'

export function UserPage({ children, className }) {
  return (
    <div className={className} style={{ padding:'clamp(1rem, 4vw, 2.5rem)', maxWidth:1300, margin:'0 auto', display:'flex', flexDirection:'column', gap:'clamp(1rem, 3vw, 2rem)' }}>
      {children}
    </div>
  )
}

export function UserPageHeader({ title, icon: Icon, iconColor='var(--accent)', subtitle, children }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
      <div>
        <h1 style={{ fontSize:'1.875rem', fontWeight:800, color:'var(--text-primary)', letterSpacing:'-0.03em', display:'flex', alignItems:'center', gap:10, lineHeight:1.1 }}>
          {Icon && <Icon size={26} style={{ color:iconColor, flexShrink:0 }}/>}
          {title}
        </h1>
        {subtitle && <p style={{ fontSize:'0.875rem', color:'var(--text-muted)', marginTop:6 }}>{subtitle}</p>}
      </div>
      {children && <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap', alignItems:'center' }}>{children}</div>}
    </div>
  )
}

export function UserStatCard({ label, value, sub, icon: Icon, accent='var(--accent)', index=0, to, onClick, active }) {
  const inner = (
    <motion.div
      initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:index*0.05 }}
      onClick={onClick}
      style={{
        position:'relative', overflow:'hidden',
        background:'var(--bg-surface)',
        border:`1px solid ${active ? accent : 'var(--border)'}`,
        borderRadius:14, padding:'1.125rem 1.25rem',
        boxShadow:'var(--shadow-card)',
        display:'flex', flexDirection:'column', gap:14,
        cursor: onClick||to ? 'pointer' : 'default',
        transition:'all .2s',
      }}>
      <div style={{ position:'absolute', top:-18, right:-18, width:72, height:72, borderRadius:'50%', background:accent, opacity:.07, filter:'blur(16px)', pointerEvents:'none' }}/>
      <div style={{ width:36, height:36, borderRadius:10, background:`color-mix(in srgb, ${accent} 15%, transparent)`, border:`1px solid color-mix(in srgb, ${accent} 25%, transparent)`, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Icon size={17} style={{ color:accent }}/>
      </div>
      <div>
        <p style={{ fontSize:'1.875rem', fontWeight:800, color:'var(--text-primary)', lineHeight:1, letterSpacing:'-0.025em' }}>
          {value ?? <span style={{ color:'var(--text-dim)' }}>—</span>}
        </p>
        <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', fontWeight:500, marginTop:5, textTransform:'uppercase', letterSpacing:'0.07em' }}>{label}</p>
        {sub && <p style={{ fontSize:'0.8rem', color:'var(--text-dim)', marginTop:3 }}>{sub}</p>}
      </div>
    </motion.div>
  )
  return to ? <Link to={to} style={{ textDecoration:'none' }}>{inner}</Link> : inner
}

export function UserCard({ title, icon: Icon, accent='var(--accent)', action, children, noPadding, style: extraStyle }) {
  return (
    <div style={{
      background:'var(--bg-surface)', borderRadius:18,
      border:'1px solid var(--border)',
      boxShadow:'var(--shadow-card)',
      overflow:'hidden', ...extraStyle
    }}>
      {title && (
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border-soft)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {Icon && (
              <div style={{ width:28, height:28, borderRadius:8, background:`color-mix(in srgb, ${accent} 15%, transparent)`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon size={14} style={{ color:accent }}/>
              </div>
            )}
            <span style={{ fontSize:'0.9375rem', fontWeight:700, color:'var(--text-primary)' }}>{title}</span>
          </div>
          {action}
        </div>
      )}
      <div style={noPadding ? {} : { padding:'1.25rem 1.5rem' }}>{children}</div>
    </div>
  )
}

export function UserFilterTabs({ tabs, active, onChange }) {
  return (
    <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)', overflowX:'auto' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{
            display:'flex', alignItems:'center', gap:7,
            padding:'9px 16px', fontSize:'0.9rem', fontWeight:500,
            borderBottom: active===t.id ? '2px solid var(--accent)' : '2px solid transparent',
            color: active===t.id ? 'var(--accent)' : 'var(--text-muted)',
            background:'transparent', cursor:'pointer', whiteSpace:'nowrap', transition:'color .15s',
          }}>
          {t.label}
          {t.count > 0 && (
            <span style={{
              minWidth:20, height:20, padding:'0 5px', borderRadius:99,
              background: active===t.id ? 'var(--accent)' : 'var(--bg-surface2)',
              color: active===t.id ? '#fff' : 'var(--text-muted)',
              fontSize:'0.75rem', fontWeight:700,
              display:'inline-flex', alignItems:'center', justifyContent:'center',
            }}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

export function UserSearch(props) { return <_SearchBox {...props}/> }

export function ViewAllLink({ to, label='View all' }) {
  return (
    <Link to={to} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.875rem', fontWeight:600, color:'var(--accent)', textDecoration:'none', opacity:0.85 }}
      onMouseEnter={e=>e.currentTarget.style.opacity=1}
      onMouseLeave={e=>e.currentTarget.style.opacity=0.85}>
      {label} <ArrowRight size={13}/>
    </Link>
  )
}

export function MetricRow({ label, value, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border-soft)' }}>
      <span style={{ fontSize:'0.875rem', color:'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize:'0.9375rem', fontWeight:600, color:color||'var(--text-primary)', fontFamily:'monospace' }}>{value ?? '—'}</span>
    </div>
  )
}

export function UserActionBtn({ label, icon: Icon, onClick, danger, disabled, color, hoverColor }) {
  const [hover, setHover] = React.useState(false)
  const hc = danger ? '#f87171' : (hoverColor || color || 'var(--accent)')
  const base = color || 'var(--text-muted)'
  return (
    <button onClick={onClick} disabled={disabled} title={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display:'inline-flex', alignItems:'center', gap:5,
        padding:'5px 11px', borderRadius:8, cursor:disabled?'not-allowed':'pointer',
        border:`1px solid ${hover ? 'var(--border-bright)' : 'var(--border)'}`,
        background: hover ? 'var(--bg-surface2)' : 'transparent',
        color: hover ? hc : base,
        fontSize:'0.8125rem', fontWeight:500, transition:'all .15s',
        opacity: disabled ? 0.4 : 1, whiteSpace:'nowrap', userSelect:'none',
      }}>
      {Icon && <Icon size={13} style={{ flexShrink:0 }}/>}
      {label}
    </button>
  )
}

// ── Shared Avatar — consistent across all user pages ─────────────────────────
export function UserAvatar({ name, photoUrl, size=32 }) {
  const letter = (name||'?')[0].toUpperCase()
  const colors = ['#58a6ff','#34d399','#c084fc','#fb923c','#facc15','#22d3ee','#f87171','#a78bfa']
  const col = colors[letter.charCodeAt(0) % colors.length]
  if (photoUrl)
    return (
      <div style={{ width:size, height:size, borderRadius:'50%', overflow:'hidden', flexShrink:0, border:'1px solid var(--border)' }}>
        <img src={photoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
      </div>
    )
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0,
      background:`color-mix(in srgb, ${col} 15%, var(--bg-surface2))`,
      border:`1.5px solid color-mix(in srgb, ${col} 30%, transparent)`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize: size > 28 ? '0.875rem' : '0.75rem', fontWeight:700, color:col,
      userSelect:'none',
    }}>
      {letter}
    </div>
  )
}
