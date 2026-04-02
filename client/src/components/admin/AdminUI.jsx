import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

export function AdminPage({ children }) {
  return (
    <div style={{ padding:'2rem 2.5rem', maxWidth:1300, margin:'0 auto', display:'flex', flexDirection:'column', gap:'2rem' }}>
      {children}
    </div>
  )
}

export function PageHeader({ title, icon: Icon, iconColor='var(--accent)', subtitle, children }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
      <div>
        <h1 style={{ fontSize:'1.875rem', fontWeight:800, color:'var(--text-primary)', letterSpacing:'-0.03em', display:'flex', alignItems:'center', gap:10, lineHeight:1.1 }}>
          {Icon && <Icon size={26} style={{ color:iconColor, flexShrink:0 }}/>}
          {title}
        </h1>
        {subtitle && <p style={{ fontSize:'0.9rem', color:'var(--text-muted)', marginTop:6 }}>{subtitle}</p>}
      </div>
      {children && <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' }}>{children}</div>}
    </div>
  )
}

export function StatCard({ label, value, sub, icon: Icon, accent='var(--accent)', index=0, to, onClick, active }) {
  const inner = (
    <motion.div
      initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:index*0.05 }}
      onClick={onClick}
      style={{
        position:'relative', overflow:'hidden',
        background: active ? `color-mix(in srgb, ${accent} 10%, var(--bg-surface))` : 'var(--bg-surface)',
        border:`1px solid ${active ? accent : 'var(--border)'}`,
        borderRadius:14, padding:'1.125rem 1.25rem',
        display:'flex', flexDirection:'column', gap:14,
        cursor: onClick||to ? 'pointer' : 'default',
        transition:'all .2s',
        boxShadow:'var(--shadow-card)',
      }}>
      <div style={{ position:'absolute', top:-18, right:-18, width:72, height:72, borderRadius:'50%', background:accent, opacity:0.08, filter:'blur(16px)', pointerEvents:'none' }}/>
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

export function SectionCard({ title, icon: Icon, accent='var(--accent)', action, children, noPadding }) {
  return (
    <div style={{
      background:'var(--bg-surface)', borderRadius:18,
      border:'1px solid var(--border)',
      boxShadow:'var(--shadow-card)',
      overflow:'hidden',
    }}>
      {title && (
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border-soft)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {Icon && (
              <div style={{ width:28, height:28, borderRadius:8, background:`color-mix(in srgb, ${accent} 15%, transparent)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
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

export function MetricRow({ label, value, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border-soft)' }}>
      <span style={{ fontSize:'0.875rem', color:'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize:'0.9375rem', fontWeight:600, color:color||'var(--text-primary)', fontFamily:'monospace' }}>{value ?? '—'}</span>
    </div>
  )
}

export function FilterTabs({ tabs, active, onChange }) {
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

export function LinkBtn({ to, label }) {
  return (
    <Link to={to} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.875rem', fontWeight:600, color:'var(--accent)', textDecoration:'none', opacity:0.85 }}
      onMouseEnter={e=>e.currentTarget.style.opacity=1}
      onMouseLeave={e=>e.currentTarget.style.opacity=0.85}>
      {label} <ArrowRight size={13}/>
    </Link>
  )
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <div style={{ position:'relative', flex:1, minWidth:200 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"
        style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input value={value} onChange={onChange} placeholder={placeholder||'Search…'}
        style={{ width:'100%', paddingLeft:36, paddingRight:12, paddingTop:'0.65rem', paddingBottom:'0.65rem',
          background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:9,
          color:'var(--text-primary)', fontSize:'0.9375rem', outline:'none', transition:'border-color .15s' }}
        onFocus={e=>e.target.style.borderColor='var(--accent)'}
        onBlur={e=>e.target.style.borderColor='var(--border)'}/>
    </div>
  )
}
