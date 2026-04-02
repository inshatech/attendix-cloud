import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Mail, Phone, MapPin, Globe, Linkedin, Twitter, Github,
  Fingerprint, Sparkles, Heart, ExternalLink,
} from 'lucide-react'
import api from '../lib/api'
import { Link } from 'react-router-dom'

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'

// ── Fade-in wrapper ───────────────────────────────────────────────────────────
const Fade = ({ children, delay = 0, y = 20 }) => (
  <motion.div
    initial={{ opacity: 0, y }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}>
    {children}
  </motion.div>
)

// ── Safe JSON parse ───────────────────────────────────────────────────────────
function safeParse(str, fallback = []) {
  try { return JSON.parse(str || '[]') } catch { return fallback }
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.4 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      style={{
        padding: '22px 20px', borderRadius: 16,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 20px rgba(0,0,0,.18)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
      <div style={{ fontSize: '2rem', lineHeight: 1 }}>{icon || '⭐'}</div>
      <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</p>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</p>
    </motion.div>
  )
}

// ── Team card ─────────────────────────────────────────────────────────────────
function TeamCard({ name, role, bio, photo, index }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.06 * index, duration: 0.4 }}
      style={{
        padding: '24px 20px', borderRadius: 18, textAlign: 'center',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 20px rgba(0,0,0,.18)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      }}>
      {photo ? (
        <img src={photo} alt={name}
          style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover',
            border: '3px solid var(--accent)', boxShadow: '0 0 0 4px rgba(88,166,255,.15)' }}/>
      ) : (
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'linear-gradient(135deg,#58a6ff,#c084fc)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.4rem', fontWeight: 800, color: '#fff',
          border: '3px solid rgba(88,166,255,.3)',
          boxShadow: '0 0 0 4px rgba(88,166,255,.1)',
        }}>{initials}</div>
      )}
      <div>
        <p style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{name}</p>
        <p style={{ fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>{role}</p>
      </div>
      {bio && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6, textAlign: 'center' }}>{bio}</p>}
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function About() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/about').then(r => setData(r.data || {})).catch(() => setData({})).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(88,166,255,.1)',
          border: '1px solid rgba(88,166,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Fingerprint size={22} style={{ color: '#58a6ff', animation: 'spin 2s linear infinite' }}/>
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>Loading…</p>
      </div>
    </div>
  )

  const d        = data || {}
  const features = safeParse(d.features)
  const team     = safeParse(d.team)
  const version  = d.version || APP_VERSION
  const hasContact = d.contactEmail || d.contactPhone || d.contactAddress
  const hasSocial  = d.linkedin || d.twitter || d.github || d.website

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>

      {/* ── HERO ── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #0d1117 0%, #0f1923 40%, #111827 100%)',
        padding: '80px 24px 72px',
      }}>
        {/* Background glows */}
        <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
          <div style={{ position:'absolute', top:-100, left:'10%', width:500, height:500, borderRadius:'50%',
            background:'radial-gradient(circle, rgba(88,166,255,.08) 0%, transparent 70%)', }}/>
          <div style={{ position:'absolute', bottom:-100, right:'10%', width:400, height:400, borderRadius:'50%',
            background:'radial-gradient(circle, rgba(192,132,252,.06) 0%, transparent 70%)', }}/>
        </div>

        <div style={{ position:'relative', maxWidth:800, margin:'0 auto', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:20 }}>
          <Fade delay={0}>
            {/* Logo / Icon */}
            {d.logoUrl ? (
              <img src={d.logoUrl} alt="logo"
                style={{ width:80, height:80, borderRadius:20, objectFit:'contain',
                  boxShadow:'0 0 0 1px rgba(255,255,255,.1), 0 8px 32px rgba(0,0,0,.4)' }}/>
            ) : (
              <div style={{ width:80, height:80, borderRadius:20,
                background:'linear-gradient(135deg,#1a2942,#1e1e3f)',
                border:'1px solid rgba(88,166,255,.25)', boxShadow:'0 0 0 1px rgba(255,255,255,.04), 0 8px 32px rgba(0,0,0,.4)',
                display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Fingerprint size={36} style={{ color:'#58a6ff' }}/>
              </div>
            )}
          </Fade>

          <Fade delay={0.08}>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', justifyContent:'center' }}>
              <h1 style={{ fontSize:'clamp(2rem,5vw,3rem)', fontWeight:900, color:'#fff', letterSpacing:'-1px', lineHeight:1 }}>
                {d.appName || 'Attendix'}
              </h1>
              <span style={{
                padding:'4px 12px', borderRadius:99, fontSize:'0.78rem', fontWeight:700, fontFamily:'monospace',
                background:'rgba(88,166,255,.12)', color:'#58a6ff', border:'1px solid rgba(88,166,255,.25)',
              }}>v{version}</span>
            </div>
          </Fade>

          <Fade delay={0.14}>
            <p style={{ fontSize:'clamp(1rem,2.5vw,1.3rem)', color:'rgba(255,255,255,.65)', fontWeight:500, maxWidth:520 }}>
              {d.tagline || 'Attendance & Payroll Simplified'}
            </p>
          </Fade>

          {d.companyName && (
            <Fade delay={0.18}>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
                <span style={{ fontSize:'0.82rem', color:'rgba(255,255,255,.4)' }}>by</span>
                <span style={{ fontSize:'0.9rem', fontWeight:700, color:'rgba(255,255,255,.7)' }}>{d.companyName}</span>
                {d.foundedYear && (
                  <span style={{ fontSize:'0.78rem', color:'rgba(255,255,255,.35)', fontFamily:'monospace' }}>· est. {d.foundedYear}</span>
                )}
              </div>
            </Fade>
          )}

          {d.description && (
            <Fade delay={0.22}>
              <p style={{ fontSize:'0.925rem', color:'rgba(255,255,255,.5)', lineHeight:1.75, maxWidth:620, textAlign:'center' }}>
                {d.description}
              </p>
            </Fade>
          )}

          {(d.website || hasSocial) && (
            <Fade delay={0.26}>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center', marginTop:4 }}>
                {d.website && (
                  <a href={d.website} target="_blank" rel="noopener noreferrer"
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:99,
                      background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)',
                      color:'rgba(255,255,255,.7)', fontSize:'0.82rem', fontWeight:600, textDecoration:'none',
                      transition:'all .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,.1)'; e.currentTarget.style.color='#fff' }}
                    onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,.06)'; e.currentTarget.style.color='rgba(255,255,255,.7)' }}>
                    <Globe size={13}/> Website <ExternalLink size={10}/>
                  </a>
                )}
                {d.github && (
                  <a href={d.github} target="_blank" rel="noopener noreferrer"
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:99,
                      background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)',
                      color:'rgba(255,255,255,.7)', fontSize:'0.82rem', fontWeight:600, textDecoration:'none' }}>
                    <Github size={13}/> GitHub
                  </a>
                )}
                {d.linkedin && (
                  <a href={d.linkedin} target="_blank" rel="noopener noreferrer"
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:99,
                      background:'rgba(10,102,194,.15)', border:'1px solid rgba(10,102,194,.3)',
                      color:'#5ba4cf', fontSize:'0.82rem', fontWeight:600, textDecoration:'none' }}>
                    <Linkedin size={13}/> LinkedIn
                  </a>
                )}
                {d.twitter && (
                  <a href={d.twitter} target="_blank" rel="noopener noreferrer"
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:99,
                      background:'rgba(29,161,242,.1)', border:'1px solid rgba(29,161,242,.25)',
                      color:'#1da1f2', fontSize:'0.82rem', fontWeight:600, textDecoration:'none' }}>
                    <Twitter size={13}/> Twitter / X
                  </a>
                )}
              </div>
            </Fade>
          )}
        </div>

        {/* Bottom fade */}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:60,
          background:'linear-gradient(to bottom, transparent, var(--bg-base))', pointerEvents:'none' }}/>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px 80px', display: 'flex', flexDirection: 'column', gap: 64 }}>

        {/* Mission */}
        {d.missionStatement && (
          <Fade delay={0.05}>
            <div style={{ textAlign:'center' }}>
              <div style={{ display:'inline-flex', alignItems:'center', gap:8, marginBottom:16,
                padding:'5px 14px', borderRadius:99, background:'rgba(250,204,21,.08)',
                border:'1px solid rgba(250,204,21,.2)' }}>
                <Sparkles size={13} style={{ color:'#fbbf24' }}/>
                <span style={{ fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#fbbf24' }}>Our Mission</span>
              </div>
              <blockquote style={{
                fontSize: 'clamp(1.05rem,2.5vw,1.3rem)', fontWeight: 500,
                color: 'var(--text-secondary)', lineHeight: 1.75,
                maxWidth: 680, margin: '0 auto',
                borderLeft: '3px solid var(--accent)',
                paddingLeft: 20, textAlign: 'left',
              }}>
                "{d.missionStatement}"
              </blockquote>
            </div>
          </Fade>
        )}

        {/* Features */}
        {features.length > 0 && (
          <Fade delay={0.08}>
            <div>
              <SectionHeading label="Key Features" sub="What makes Attendix powerful"/>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                {features.map((f, i) => (
                  <FeatureCard key={i} index={i} icon={f.icon} title={f.title} desc={f.desc}/>
                ))}
              </div>
            </div>
          </Fade>
        )}

        {/* Team */}
        {team.length > 0 && (
          <Fade delay={0.1}>
            <div>
              <SectionHeading label="The Team" sub="The people behind Attendix"/>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                {team.map((m, i) => (
                  <TeamCard key={i} index={i} name={m.name} role={m.role} bio={m.bio} photo={m.photo}/>
                ))}
              </div>
            </div>
          </Fade>
        )}

        {/* Contact */}
        {(hasContact || hasSocial) && (
          <Fade delay={0.12}>
            <div>
              <SectionHeading label="Get In Touch" sub="Reach out to us"/>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {d.contactEmail && (
                  <ContactCard icon={<Mail size={18} style={{color:'#58a6ff'}}/>} label="Email"
                    value={d.contactEmail} href={`mailto:${d.contactEmail}`} accent="#58a6ff"/>
                )}
                {d.contactPhone && (
                  <ContactCard icon={<Phone size={18} style={{color:'#34d399'}}/>} label="Phone"
                    value={d.contactPhone} href={`tel:${d.contactPhone}`} accent="#34d399"/>
                )}
                {d.contactAddress && (
                  <ContactCard icon={<MapPin size={18} style={{color:'#fb923c'}}/>} label="Address"
                    value={d.contactAddress} accent="#fb923c"/>
                )}
                {d.website && (
                  <ContactCard icon={<Globe size={18} style={{color:'#c084fc'}}/>} label="Website"
                    value={d.website.replace(/^https?:\/\//, '')} href={d.website} accent="#c084fc"/>
                )}
                {d.linkedin && (
                  <ContactCard icon={<Linkedin size={18} style={{color:'#5ba4cf'}}/>} label="LinkedIn"
                    value="Connect on LinkedIn" href={d.linkedin} accent="#5ba4cf"/>
                )}
                {d.twitter && (
                  <ContactCard icon={<Twitter size={18} style={{color:'#1da1f2'}}/>} label="Twitter / X"
                    value="Follow us" href={d.twitter} accent="#1da1f2"/>
                )}
                {d.github && (
                  <ContactCard icon={<Github size={18} style={{color:'#a0a0c0'}}/>} label="GitHub"
                    value="View source" href={d.github} accent="#a0a0c0"/>
                )}
              </div>
            </div>
          </Fade>
        )}

        {/* Tech stack tags */}
        {/* <Fade delay={0.14}>
          <div style={{ textAlign:'center' }}>
            <p style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-dim)', marginBottom:12 }}>Built with</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center' }}>
              {['React', 'Node.js', 'MongoDB', 'WebSocket', 'Express', 'SheetJS', 'Framer Motion'].map(t => (
                <span key={t} style={{
                  padding:'4px 12px', borderRadius:99, fontSize:'0.75rem', fontWeight:600,
                  background:'var(--bg-surface)', border:'1px solid var(--border)',
                  color:'var(--text-muted)',
                }}>{t}</span>
              ))}
            </div>
          </div>
        </Fade> */}
      </div>

      {/* ── FOOTER ── */}
      <div style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        padding: '28px 24px',
      }}>
        <div style={{ maxWidth:900, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:9, background:'rgba(88,166,255,.1)',
              border:'1px solid rgba(88,166,255,.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Fingerprint size={15} style={{ color:'#58a6ff' }}/>
            </div>
            <div>
              <p style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--text-primary)' }}>
                {d.appName || 'Attendix'}
                <span style={{ marginLeft:6, fontFamily:'monospace', fontSize:'0.72rem', color:'var(--text-dim)' }}>v{version}</span>
              </p>
              <p style={{ fontSize:'0.7rem', color:'var(--text-dim)' }}>{d.tagline || 'Attendance & Payroll Simplified'}</p>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Heart size={12} style={{ color:'#58a6ff', fill:'#58a6ff' }}/>
            <p style={{ fontSize:'0.78rem', color:'var(--text-dim)' }}>
              Proudly Powered by: {' '}
              <Link to="https://www.inshatech.com" style={{ color:'var(--text-primary)' }} target="_blank" rel="noopener noreferrer">
                <strong style={{ color:'var(--text-secondary)' }}>{d.companyName || 'Insha Technologies'}</strong>
              </Link>
              {d.foundedYear && <span style={{ color:'var(--text-dim)' }}> ·</span>}
            </p>
          </div>
          <p style={{ fontSize:'0.72rem', color:'var(--text-dim)' }}>
            © {new Date().getFullYear()} {d.companyName || 'Insha Technologies'}. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function SectionHeading({ label, sub }) {
  return (
    <div style={{ marginBottom: 24, textAlign:'center' }}>
      <h2 style={{ fontSize:'1.5rem', fontWeight:800, color:'var(--text-primary)', letterSpacing:'-0.5px' }}>{label}</h2>
      {sub && <p style={{ fontSize:'0.875rem', color:'var(--text-muted)', marginTop:4 }}>{sub}</p>}
    </div>
  )
}

function ContactCard({ icon, label, value, href, accent }) {
  const inner = (
    <motion.div whileHover={{ y: -3 }} style={{
      padding: '16px 18px', borderRadius: 14, display: 'flex', alignItems: 'flex-start', gap: 12,
      background: 'var(--bg-surface)', border: `1px solid color-mix(in srgb,${accent} 15%,var(--border))`,
      boxShadow: '0 2px 12px rgba(0,0,0,.15)',
      transition: 'box-shadow .15s',
    }}>
      <div style={{ width:36, height:36, borderRadius:10, flexShrink:0,
        background:`color-mix(in srgb,${accent} 10%,transparent)`,
        border:`1px solid color-mix(in srgb,${accent} 20%,transparent)`,
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        {icon}
      </div>
      <div style={{ minWidth:0 }}>
        <p style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text-dim)', marginBottom:2 }}>{label}</p>
        <p style={{ fontSize:'0.82rem', color:'var(--text-secondary)', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{value}</p>
      </div>
      {href && <ExternalLink size={11} style={{ color:'var(--text-dim)', flexShrink:0, marginTop:3, marginLeft:'auto' }}/>}
    </motion.div>
  )
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration:'none' }}>{inner}</a>
  return inner
}
