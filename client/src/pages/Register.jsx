import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { renderGoogleButton } from '../lib/googleAuth'
import { User, Mail, Lock, Smartphone, ArrowRight, Fingerprint, CheckCircle2, Sun, Moon, Zap, Shield, BarChart2, Globe, Clock, Users, Heart } from 'lucide-react'
import BridgeDownloadCard from '../components/ui/BridgeDownloadCard'
import { Input } from '../components/ui/Input'
import { Toaster, useToast } from '../components/ui/Toast'
import { useAuth } from '../store/auth'
import { useTheme } from '../store/theme'
import { useBrand } from '../store/brand'
import api from '../lib/api'

function StrengthBar({ pw }) {
  if (!pw) return null
  const c = [pw.length >= 8, /[A-Z]/.test(pw), /[0-9]/.test(pw), /[^A-Za-z0-9]/.test(pw)]
  const s = c.filter(Boolean).length
  const cols = ['', '#ef4444', '#f97316', 'var(--accent)', '#22c55e']
  const lbls = ['', 'Weak', 'Fair', 'Good', 'Strong']
  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginBottom: 4 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            flex: 1, height: 2.5, borderRadius: 99, transition: 'background .3s',
            background: i < s ? cols[s] : 'var(--border)'
          }} />
        ))}
        {s > 0 && <span style={{ fontSize: '0.65rem', fontWeight: 800, color: cols[s], marginLeft: 5, minWidth: 32 }}>{lbls[s]}</span>}
      </div>
    </div>
  )
}

const PERKS = [
  { icon: Zap, t: 'Real-time feed', d: 'Live biometric punches, zero delay' },
  { icon: Users, t: 'Multi-branch', d: 'All locations, one dashboard' },
  { icon: BarChart2, t: 'Auto reports', d: 'Daily, monthly, custom Excel exports' },
  { icon: Shield, t: 'AES-256 + 2FA', d: 'Enterprise-grade security built in' },
  { icon: Globe, t: 'Bridge technology', d: 'Works on any network, any device' },
  { icon: Clock, t: 'Shift & leave', d: 'Full policy engine per employee' },
]

export default function Register() {
  const [f, setF] = useState({ name: '', email: '', mobile: '', password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const { setUser } = useAuth()
  const { toast } = useToast()
  const { theme, toggle } = useTheme()
  const nav = useNavigate()
  const isLight = theme === 'light'
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [googleClientId, setGoogleClientId] = useState('')
  const set = k => e => setF(v => ({ ...v, [k]: e.target.value }))
  const { logoUrl, appName, tagline, version, companyName, load } = useBrand()
  useEffect(() => { load() }, [])
  const ver = version || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0')

  async function submit() {
    if (!f.name) return toast('Full name is required', 'error')
    if (!f.email) return toast('Email is required', 'error')
    if (f.password.length < 8) return toast('Password must be at least 8 characters', 'error')
    if (f.password !== f.confirm) return toast('Passwords do not match', 'error')
    setBusy(true)
    try {
      const body = { name: f.name, email: f.email, password: f.password }
      if (f.mobile) body.mobile = f.mobile
      const r = await api.post('/auth/register', body)
      setUser({ name: r.name, role: r.role }, r.accessToken, r.refreshToken)
      toast('Account created! 🎉', 'success')
      nav('/dashboard', { replace: true })
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  useEffect(() => {
    api.get('/auth/google/status').then(r => { setGoogleEnabled(r.enabled); if (r.clientId) setGoogleClientId(r.clientId) }).catch(() => { })
  }, [])

  useEffect(() => {
    if (!googleEnabled || !googleClientId) return
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
    renderGoogleButton('__google_reg_btn', googleClientId, async (credential) => {
      try {
        const r = await api.post('/auth/google', { credential })
        setUser({ name: r.name, role: r.role, userId: r.userId }, r.accessToken, r.refreshToken)
        toast('Account created! 🎉', 'success')
        nav('/dashboard', { replace: true })
      } catch (e) { toast(e.message, 'error') }
    }, isDark ? 'filled_blue' : 'outline')
  }, [googleEnabled, googleClientId])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', overflowX: 'hidden', background: 'var(--bg-base)' }}>
      <Toaster />

      {/* ══ LEFT PANEL — 42% ══ */}
      <div className="hidden lg:flex"
        style={{
          width: '42%', flexShrink: 0, flexDirection: 'column',
          background: 'var(--bg-surface)', borderRight: '1px solid var(--border)',
          position: 'relative', overflow: 'hidden'
        }}>

        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(var(--grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--grid-line) 1px,transparent 1px)',
          backgroundSize: '40px 40px'
        }} />
        <div style={{
          position: 'absolute', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%',
          background: 'var(--accent-muted)', filter: 'blur(70px)', pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute', bottom: -60, left: -60, width: 220, height: 220, borderRadius: '50%',
          background: 'var(--accent-muted)', filter: 'blur(60px)', pointerEvents: 'none', opacity: .5
        }} />

        <div style={{
          position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: '2.5rem 2.75rem'
        }}>

          {/* ── Logo — same style as sidebar Brand ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 11, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
              boxShadow: '0 4px 18px var(--accent-muted)', overflow: 'hidden'
            }}>
              {logoUrl
                ? <img src={logoUrl} alt={appName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <Fingerprint size={20} style={{ color: 'var(--accent)' }} />}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{
                  fontWeight: 900, fontSize: '1.0625rem', color: 'var(--text-primary)',
                  letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0
                }}>
                  {appName}
                </p>
                <span style={{
                  fontSize: '0.6rem', fontWeight: 700, fontFamily: 'monospace',
                  color: 'var(--accent)', background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
                  borderRadius: 4, padding: '1px 5px', lineHeight: '1.6', flexShrink: 0
                }}>v{ver}</span>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>
                {tagline}
              </p>
            </div>
          </div>

          {/* ── Hero ── */}
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 13px',
              borderRadius: 99, background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
              fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 16, letterSpacing: '-0.01em'
            }}>
              🎁 14-day free trial · no card needed
            </div>
            <h2 style={{
              fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)',
              letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 10
            }}>
              Everything you<br />
              need to run<br />
              <span style={{ color: 'var(--accent)' }}>attendance.</span>
            </h2>
            <p style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
              From small offices to enterprise chains — shifts, leaves, biometric sync, and reporting in one platform.
            </p>

            {/* ── Feature grid 2×3 ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              {PERKS.map((p, i) => (
                <motion.div key={p.t} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: .35 + i * .06 }}
                  style={{
                    padding: '14px', borderRadius: 12, background: 'var(--bg-surface2)',
                    border: '1px solid var(--border)', transition: 'all .18s', cursor: 'default'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.background = 'var(--accent-muted)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-surface2)' }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 9,
                    background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10
                  }}>
                    <p.icon size={15} style={{ color: 'var(--accent)' }} />
                  </div>
                  <p style={{
                    fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)',
                    marginBottom: 4, letterSpacing: '-0.01em'
                  }}>{p.t}</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{p.d}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Bridge download */}
          <BridgeDownloadCard />
        </div>
      </div>

      {/* ══ RIGHT PANEL — remaining ══ */}
      <div style={{
        flex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '2rem 2rem 4.5rem', position: 'relative', overflowX: 'hidden'
      }}>

        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(ellipse 70% 50% at 60% 30%, var(--accent-muted) 0%, transparent 70%)'
        }} />

        {/* Theme toggle */}
        <motion.button type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .4 }}
          onClick={toggle} whileHover={{ scale: 1.08 }} whileTap={{ scale: .93 }}
          style={{
            position: 'absolute', top: 20, right: 20, width: 38, height: 38, borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-muted)', transition: 'border-color .2s,color .2s',
            boxShadow: 'var(--shadow-card)', zIndex: 2
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
          {isLight ? <Moon size={16} /> : <Sun size={16} />}
        </motion.button>

        {/* Top logo — same style as sidebar Brand */}
        <div className="lg:hidden" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, position: 'relative', zIndex: 1 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {logoUrl
              ? <img src={logoUrl} alt={appName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <Fingerprint size={17} style={{ color: 'var(--accent)' }} />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{appName}</span>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)', background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', borderRadius: 4, padding: '1px 5px' }}>v{ver}</span>
            </div>
            {tagline && <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{tagline}</p>}
          </div>
        </div>

        {/* Form — compact, no scroll */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: .15, type: 'spring', stiffness: 240, damping: 26 }}
          style={{ width: '100%', maxWidth: 360, position: 'relative', zIndex: 1 }}>


          {/* Google Sign-In */}
          {googleEnabled && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }} style={{ marginBottom: 0 }}>
              <div id="__google_reg_btn" style={{ display: "flex", justifyContent: "center", minHeight: 44, marginBottom: 14 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>or sign up with email</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            </motion.div>
          )}

          <h2 style={{
            fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-primary)',
            letterSpacing: '-0.04em', marginBottom: 4
          }}>Create account</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
            Free trial starts immediately
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <Input label="Full Name" icon={User} value={f.name} onChange={set('name')} placeholder="Jane Smith" autoComplete="name" />
            <Input label="Email Address" icon={Mail} value={f.email} onChange={set('email')} placeholder="jane@company.com" type="email" autoComplete="email" />
            <Input label="Mobile (optional)" icon={Smartphone} value={f.mobile} onChange={set('mobile')} placeholder="+91 98765 43210" type="tel" />
            <div>
              <Input label="Password" icon={Lock} type="password" value={f.password} onChange={set('password')} placeholder="min 8 characters" autoComplete="new-password" />
              <StrengthBar pw={f.password} />
            </div>
            <Input label="Confirm Password" icon={Lock} type="password" value={f.confirm} onChange={set('confirm')} placeholder="repeat password" autoComplete="new-password" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }} />

            <motion.button type="button" onClick={submit} disabled={busy}
              whileHover={{ scale: 1.015 }} whileTap={{ scale: .975 }}
              style={{
                width: '100%', padding: '13px', borderRadius: 11, border: 'none',
                fontWeight: 800, fontSize: '0.9375rem', cursor: busy ? 'not-allowed' : 'pointer',
                background: 'var(--accent)', color: '#fff',
                boxShadow: '0 6px 20px var(--accent-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: busy ? .7 : 1, marginTop: 2, transition: 'opacity .2s'
              }}>
              {busy
                ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: .8, repeat: Infinity, ease: 'linear' }}
                  style={{ width: 17, height: 17, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Creating…</>
                : <>Create Account & Start Trial <ArrowRight size={16} /></>}
            </motion.button>
          </div>

          <p style={{ marginTop: 16, textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>Sign in →</Link>
          </p>
        </motion.div>

        <div style={{ position: 'absolute', bottom: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>© {new Date().getFullYear()} {useBrand.getState().appName} | </p>
            <Heart size={10} style={{ color: '#58a6ff', fill: '#58a6ff' }} />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>
              Powered by: {' '}
              <Link to="https://www.inshatech.com" style={{ color: 'var(--text-primary)' }} target="_blank" rel="noopener noreferrer">
                <strong style={{ color: 'var(--text-secondary)' }}>{useBrand.getState().companyName || 'Insha Technologies'}</strong>
              </Link>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {[['privacy-policy','Privacy Policy'],['terms-of-service','Terms'],['refund-policy','Refund'],['report-abuse','Report Abuse']].map(([slug,label]) => (
              <Link key={slug} to={`/policies/${slug}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textDecoration: 'none' }}>
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
