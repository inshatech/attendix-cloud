import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Fingerprint, ArrowRight, RefreshCw, Shield, Sun, Moon,
  Zap, Lock, Users, BarChart2, Globe, Clock, CheckCircle2, Mail, Eye, EyeOff,
  Heart
} from 'lucide-react'
import BridgeDownloadCard from '../components/ui/BridgeDownloadCard'
import { OtpInput } from '../components/ui/OtpInput'
import { Modal } from '../components/ui/Modal'
import { Toaster, useToast } from '../components/ui/Toast'
import { useAuth } from '../store/auth'
import { useTheme } from '../store/theme'
import { useBrand } from '../store/brand'
import api from '../lib/api'
import { loadGSI, renderGoogleButton } from '../lib/googleAuth'

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'

const parseId = v => /^\+?[\d\s\-]{7,15}$/.test(v.trim())
  ? { mobile: v.trim().replace(/\s/g, '') }
  : { email: v.trim().toLowerCase() }

const FEATURES = [
  { icon: Zap, title: 'Real-time Attendance', desc: 'Live biometric punches stream instantly to your dashboard.' },
  { icon: Users, title: 'Multi-org Management', desc: 'Manage multiple branches from one unified platform.' },
  { icon: BarChart2, title: 'Smart Reports', desc: 'Auto-generated daily and monthly reports, export to Excel.' },
  { icon: Shield, title: 'Bank-grade Security', desc: 'AES-256 encryption, 2FA, and role-based access control.' },
  { icon: Globe, title: 'Bridge Technology', desc: 'Our gateway syncs biometric devices over any network.' },
  { icon: Clock, title: 'Shift & Leave Engine', desc: 'Shifts, overtime, grace, leave policies per employee.' },
]

/* ── Divider ── */
function Divider({ label = 'or' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

/* ── 2FA Modal ── */
function TwoFAModal({ open, onClose, onVerify, busy }) {
  const [otp, setOtp] = useState('')
  const [remember, setRemember] = useState(false)
  useEffect(() => { if (open) { setOtp(''); setRemember(false) } }, [open])
  return (
    <Modal open={open} onClose={onClose} title={null} size="sm" noBodyPad>
      <div style={{ padding: '32px 28px 28px', textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
          background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Shield size={24} style={{ color: 'var(--accent)' }} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 6 }}>
          Two-Factor Auth
        </h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 22, lineHeight: 1.6 }}>
          Enter the 6-digit code from your authenticator app
        </p>
        <OtpInput value={otp} onChange={setOtp} autoFocus />
        {/* Remember this device */}
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }} />
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Don't ask on this browser again
          </span>
        </label>
        <motion.button type="button" onClick={() => onVerify(otp, remember)} disabled={otp.length !== 6 || busy}
          whileHover={{ scale: otp.length === 6 ? 1.02 : 1 }} whileTap={{ scale: .97 }}
          style={{
            width: '100%', marginTop: 18, padding: '13px', borderRadius: 11,
            fontWeight: 800, fontSize: '0.9375rem', border: 'none',
            cursor: otp.length === 6 && !busy ? 'pointer' : 'not-allowed',
            opacity: otp.length === 6 && !busy ? 1 : 0.45,
            background: 'var(--accent)', color: '#fff', transition: 'all .2s',
            boxShadow: otp.length === 6 ? '0 6px 20px var(--accent-muted)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
          }}>
          <Shield size={15} /> Verify & Sign In
        </motion.button>
      </div>
    </Modal>
  )
}

/* ── Left panel ── */
function LeftPanel({ activeF, setActiveF }) {
  const { logoUrl, appName, tagline, version, load } = useBrand()
  useEffect(() => { load() }, [])
  const ver = version || APP_VERSION
  return (
    <div style={{
      position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', padding: '2.5rem 2.75rem'
    }}>

      {/* Logo — same style as sidebar Brand */}
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
            <p style={{ fontWeight: 900, fontSize: '1.0625rem', color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0 }}>
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

      {/* Hero */}
      <div>
        <h1 style={{
          fontSize: '2.125rem', fontWeight: 900, lineHeight: 1.1,
          letterSpacing: '-0.04em', marginBottom: 10, color: 'var(--text-primary)'
        }}>
          Manage your<br />
          <span style={{ color: 'var(--accent)' }}>workforce</span><br />
          smarter.
        </h1>
        <p style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 22 }}>
          The complete biometric attendance platform — from small offices to enterprise chains.
        </p>

        {/* Rotating feature highlight */}
        <div style={{
          borderRadius: 14, border: '1px solid var(--border)',
          background: 'var(--bg-surface2)', overflow: 'hidden', marginBottom: 14
        }}>
          <AnimatePresence mode="wait">
            <motion.div key={activeF}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: .3 }}
              style={{ padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {(() => { const I = FEATURES[activeF].icon; return <I size={18} style={{ color: 'var(--accent)' }} /> })()}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                  {FEATURES[activeF].title}
                </p>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {FEATURES[activeF].desc}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
          <div style={{ display: 'flex', gap: 5, padding: '0 20px 13px', alignItems: 'center' }}>
            {FEATURES.map((_, i) => (
              <motion.button type="button" key={i} onClick={() => setActiveF(i)}
                animate={{ width: i === activeF ? 22 : 6 }}
                style={{
                  height: 5, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 0,
                  background: i === activeF ? 'var(--accent)' : 'var(--border)', transition: 'background .3s'
                }} />
            ))}
          </div>
        </div>

        {/* Feature list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {FEATURES.map((f, i) => (
            <div key={f.title} onClick={() => setActiveF(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px',
                borderRadius: 9, cursor: 'pointer', transition: 'all .15s',
                background: i === activeF ? 'var(--accent-muted)' : 'transparent',
                border: `1px solid ${i === activeF ? 'var(--accent-border)' : 'transparent'}`
              }}>
              <div style={{
                width: 27, height: 27, borderRadius: 7, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i === activeF ? 'var(--accent-border)' : 'var(--bg-surface2)',
                border: `1px solid ${i === activeF ? 'var(--accent-border)' : 'var(--border)'}`,
                transition: 'all .15s'
              }}>
                {(() => { const I = f.icon; return <I size={12} style={{ color: i === activeF ? 'var(--accent)' : 'var(--text-muted)' }} /> })()}
              </div>
              <p style={{
                fontSize: '0.8125rem', fontWeight: 600,
                color: i === activeF ? 'var(--text-primary)' : 'var(--text-secondary)',
                letterSpacing: '-0.01em', flex: 1
              }}>
                {f.title}
              </p>
              {i === activeF && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Bridge download */}
      <BridgeDownloadCard />
    </div>
  )
}

/* ── Main ── */
export default function Login() {
  const [tab, setTab] = useState('otp')      // 'otp' | 'password'
  const [step, setStep] = useState('id')        // for otp: 'id' | 'otp'
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [otp, setOtp] = useState('')
  const [pre, setPre] = useState('')
  const [sec, setSec] = useState(0)
  const [busy, setBusy] = useState(false)
  const [show2FA, setShow2FA] = useState(false)
  const [activeF, setActiveF] = useState(0)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [googleClientId, setGoogleClientId] = useState('')
  const [ipInfo, setIpInfo] = useState(null)
  const [hp, setHp] = useState('')           // honeypot — must stay empty
  const [tsToken, setTsToken] = useState('')
  const [tsCfg,   setTsCfg]  = useState(null)
  const tsRef  = useRef(null)
  const idRef  = useRef(null)
  const pwRef  = useRef(null)

  const { setUser } = useAuth()
  const { toast } = useToast()
  const { theme, toggle } = useTheme()
  const nav = useNavigate()
  const isLight = theme === 'light'

  useEffect(() => {
    api.get('/auth/google/status').then(r => { setGoogleEnabled(r.enabled); if (r.clientId) setGoogleClientId(r.clientId) }).catch(() => { })
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch('https://ipapi.co/json/', { signal: ctrl.signal })
        .then(r => r.json())
        .then(d => { if (d?.ip) setIpInfo({ ip: d.ip, org: d.org || d.isp || '', city: d.city || '', country: d.country_name || '' }) })
        .catch(() => {})
    }, 600)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [])

  // Turnstile config + widget (login page)
  useEffect(() => {
    api.get('/turnstile-config').then(cfg => {
      if (!cfg?.enabled || !cfg?.siteKey || !cfg?.onLogin) return
      setTsCfg(cfg)
      const scriptId = 'cf-turnstile-script'
      if (!document.getElementById(scriptId)) {
        const s = document.createElement('script')
        s.id = scriptId
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
        s.async = true
        document.head.appendChild(s)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!tsCfg?.siteKey || tab !== 'password') return
    // Reset so widget can re-render after tab switch
    if (tsRef.current) delete tsRef.current.dataset.rendered
    setTsToken('')
    let attempts = 0
    const tryRender = setInterval(() => {
      attempts++
      if (window.turnstile && tsRef.current && !tsRef.current.dataset.rendered) {
        tsRef.current.dataset.rendered = '1'
        window.turnstile.render(tsRef.current, {
          sitekey: tsCfg.siteKey,
          callback: token => setTsToken(token),
          'expired-callback': () => setTsToken(''),
          theme: 'auto', size: 'flexible',
        })
        clearInterval(tryRender)
      }
      if (attempts > 40) clearInterval(tryRender)
    }, 250)
    return () => clearInterval(tryRender)
  }, [tsCfg, tab])

  useEffect(() => {
    const t = setInterval(() => setActiveF(a => (a + 1) % FEATURES.length), 3200)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (sec <= 0) return
    const t = setTimeout(() => setSec(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [sec])

  useEffect(() => {
    setTimeout(() => {
      if (tab === 'otp' && step === 'id') idRef.current?.focus()
      if (tab === 'password') idRef.current?.focus()
    }, 80)
  }, [tab, step])

  const after = res => {
    if (res.deviceToken) localStorage.setItem('tfa_dt', res.deviceToken)
    setUser({ name: res.name, role: res.role, userId: res.userId }, res.accessToken, res.refreshToken)
    nav(res.role === 'admin' ? '/admin/users' : '/dashboard', { replace: true })
  }

  async function sendOtp() {
    if (!id.trim()) return toast('Enter your mobile or email', 'error')
    setBusy(true)
    try { await api.post('/auth/request-otp', parseId(id)); setStep('otp'); setOtp(''); setSec(60) }
    catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function verifyOtp() {
    if (otp.length !== 6) return toast('Enter all 6 digits', 'error')
    setBusy(true)
    try {
      const deviceToken = localStorage.getItem('tfa_dt') || undefined
      const r = await api.post('/auth/verify-otp', { ...parseId(id), otp, deviceToken })
      if (r.requires2FA) { setPre(r.preAuthToken); setShow2FA(true); return }
      after(r)
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function doPassword() {
    if (!id.trim() || !pw) return toast('Enter email/mobile and password', 'error')
    setBusy(true)
    try {
      const deviceToken = localStorage.getItem('tfa_dt') || undefined
      const r = await api.post('/auth/login', { ...parseId(id), password: pw, deviceToken, _hp: hp, _turnstile: tsToken })
      if (r.requires2FA) { setPre(r.preAuthToken); setShow2FA(true); return }
      after(r)
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function verify2FA(code, rememberDevice = false) {
    if (code.length !== 6) return toast('Enter all 6 digits', 'error')
    setBusy(true)
    try {
      const r = await api.post('/auth/totp/verify', { preAuthToken: pre, totpToken: code, rememberDevice })
      after(r)
    }
    catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (!googleEnabled || !googleClientId) return
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
    renderGoogleButton('__google_btn', googleClientId, async (credential) => {
      try {
        const deviceToken = localStorage.getItem('tfa_dt') || undefined
        const r = await api.post('/auth/google', { credential, deviceToken })
        if (r.requires2FA) { setPre(r.preAuthToken); setShow2FA(true); return }
        after(r)
      } catch (e) { toast(e.message || 'Google Sign-In failed', 'error') }
    }, isDark ? 'filled_blue' : 'outline')
  }, [googleEnabled, googleClientId, theme])

  function switchTab(t) {
    setTab(t); setStep('id'); setOtp(''); setPw(''); setBusy(false)
  }

  const hasId = id.trim().length > 0

  return (
    <div style={{ minHeight: '100vh', display: 'flex', overflowX: 'hidden', background: 'var(--bg-base)' }}>
      <Toaster />

      {/* ══ LEFT PANEL ══ */}
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
          position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%',
          background: 'var(--accent-muted)', filter: 'blur(70px)', pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute', bottom: -60, left: -60, width: 240, height: 240, borderRadius: '50%',
          background: 'var(--accent-muted)', filter: 'blur(60px)', pointerEvents: 'none', opacity: .5
        }} />
        <LeftPanel activeF={activeF} setActiveF={setActiveF} />
      </div>

      {/* ══ RIGHT PANEL ══ */}
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

        {/* Mobile logo — same style as sidebar */}
        {(() => {
          const b = useBrand.getState(); return (
            <div className="lg:hidden" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, position: 'relative', zIndex: 1 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {b.logoUrl
                  ? <img src={b.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <Fingerprint size={17} style={{ color: 'var(--accent)' }} />}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{b.appName}</span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)', background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', borderRadius: 4, padding: '1px 5px' }}>v{b.version || APP_VERSION}</span>
                </div>
                {b.tagline && <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0, fontFamily: 'monospace' }}>{b.tagline}</p>}
              </div>
            </div>
          )
        })()}

        {/* Form card */}
        <div style={{ width: '100%', maxWidth: 380, position: 'relative', zIndex: 1 }}>

          <h2 style={{
            fontSize: '1.875rem', fontWeight: 900, color: 'var(--text-primary)',
            letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 4
          }}>Welcome back</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 20 }}>
            Sign in to your account
          </p>

          {/* Google Sign-In */}
          {googleEnabled && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }}>
              <div id="__google_btn" style={{ display: 'flex', justifyContent: 'center', minHeight: 44, marginBottom: 16 }} />
              <Divider label="or continue with" />
            </motion.div>
          )}

          {/* OTP / Password tabs */}
          <div style={{
            display: 'flex', background: 'var(--bg-surface2)', border: '1px solid var(--border)',
            borderRadius: 11, padding: 4, marginBottom: 20, gap: 4
          }}>
            {[{ id: 'otp', label: 'OTP / SMS' }, { id: 'password', label: 'Password' }].map(t => (
              <motion.button type="button" key={t.id} onClick={() => switchTab(t.id)}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: '0.875rem', transition: 'all .18s',
                  background: tab === t.id ? 'var(--bg-elevated)' : 'transparent',
                  color: tab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: tab === t.id ? 'var(--shadow-card)' : 'none'
                }}>
                {t.label}
              </motion.button>
            ))}
          </div>

          <AnimatePresence mode="wait">

            {/* ── OTP flow ── */}
            {tab === 'otp' && step === 'id' && (
              <motion.div key="otp-id"
                initial={{ opacity: 0, y: 12, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 280, damping: 26 } }}
                exit={{ opacity: 0, y: -10, scale: .98, transition: { duration: .18 } }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{
                    display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7
                  }}>Mobile or Email</label>
                  <input ref={idRef} value={id} onChange={e => setId(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendOtp() } }}
                    placeholder="+91 98765 43210 or you@email.com"
                    style={{
                      width: '100%', padding: '13px 15px', fontSize: '0.9375rem', fontWeight: 500,
                      background: 'var(--bg-input)', border: `1.5px solid ${hasId ? 'var(--border-bright)' : 'var(--border)'}`,
                      borderRadius: 11, color: 'var(--text-primary)', outline: 'none',
                      transition: 'border-color .2s,box-shadow .2s', fontFamily: 'inherit'
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-muted)' }}
                    onBlur={e => { e.target.style.borderColor = hasId ? 'var(--border-bright)' : 'var(--border)'; e.target.style.boxShadow = 'none' }} />
                </div>
                <motion.button type="button" onClick={sendOtp} disabled={busy || !hasId}
                  whileHover={{ scale: hasId && !busy ? 1.015 : 1 }} whileTap={{ scale: hasId && !busy ? .975 : 1 }}
                  style={{
                    width: '100%', padding: '13px', borderRadius: 11, border: 'none',
                    fontWeight: 800, fontSize: '0.9375rem', cursor: hasId && !busy ? 'pointer' : 'not-allowed',
                    transition: 'all .2s',
                    background: hasId ? 'var(--accent)' : 'var(--bg-surface2)',
                    color: hasId ? '#fff' : 'var(--text-dim)',
                    boxShadow: hasId ? '0 6px 20px var(--accent-muted)' : 'none',
                    opacity: busy ? .7 : 1, marginBottom: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                  }}>
                  {busy
                    ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: .8, repeat: Infinity, ease: 'linear' }}
                      style={{ width: 17, height: 17, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Sending…</>
                    : <>Send OTP <ArrowRight size={16} /></>}
                </motion.button>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Link to="/forgot-password" style={{ fontSize: '0.8125rem', color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
                    Forgot password?
                  </Link>
                </div>
              </motion.div>
            )}

            {tab === 'otp' && step === 'otp' && (
              <motion.div key="otp-code"
                initial={{ opacity: 0, x: 20, scale: .98 }} animate={{ opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 280, damping: 26 } }}
                exit={{ opacity: 0, x: -16, scale: .98, transition: { duration: .18 } }}>
                <button type="button" onClick={() => { setStep('id'); setOtp('') }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600,
                    color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16, padding: 0
                  }}>
                  ← Change contact
                </button>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px',
                  borderRadius: 99, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', marginBottom: 14
                }}>
                  <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                    style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#16a34a' }}>Code sent to {id}</span>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 18 }}>
                  Enter the 6-digit code to sign in
                </p>
                <div style={{ marginBottom: 16 }}>
                  <OtpInput value={otp} onChange={setOtp} autoFocus />
                </div>
                <motion.button type="button" onClick={verifyOtp} disabled={otp.length !== 6 || busy}
                  whileHover={{ scale: otp.length === 6 && !busy ? 1.015 : 1 }}
                  style={{
                    width: '100%', padding: '13px', borderRadius: 11, border: 'none',
                    fontWeight: 800, fontSize: '0.9375rem', transition: 'all .2s',
                    cursor: otp.length === 6 && !busy ? 'pointer' : 'not-allowed',
                    opacity: otp.length === 6 ? 1 : 0.4,
                    background: otp.length === 6 ? 'var(--accent)' : 'var(--bg-surface2)',
                    color: otp.length === 6 ? '#fff' : 'var(--text-dim)',
                    boxShadow: otp.length === 6 ? '0 6px 20px var(--accent-muted)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12
                  }}>
                  {busy
                    ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: .8, repeat: Infinity, ease: 'linear' }}
                      style={{ width: 17, height: 17, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Verifying…</>
                    : <>Sign In <ArrowRight size={16} /></>}
                </motion.button>
                <div style={{ textAlign: 'center' }}>
                  {sec > 0
                    ? <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      Resend in <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{sec}s</span>
                    </p>
                    : <button type="button" onClick={() => sendOtp(true)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.875rem',
                        color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700
                      }}>
                      <RefreshCw size={13} /> Resend code
                    </button>}
                </div>
              </motion.div>
            )}

            {/* ── Password flow ── */}
            {tab === 'password' && (
              <motion.div key="password"
                initial={{ opacity: 0, y: 12, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 280, damping: 26 } }}
                exit={{ opacity: 0, y: -10, scale: .98, transition: { duration: .18 } }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{
                      display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7
                    }}>Email or Mobile</label>
                    <input ref={idRef} value={id} onChange={e => setId(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); pwRef.current?.focus() } }}
                      placeholder="you@email.com or +91 98765 43210"
                      style={{
                        width: '100%', padding: '13px 15px', fontSize: '0.9375rem', fontWeight: 500,
                        background: 'var(--bg-input)', border: '1.5px solid var(--border)',
                        borderRadius: 11, color: 'var(--text-primary)', outline: 'none',
                        transition: 'border-color .2s,box-shadow .2s', fontFamily: 'inherit'
                      }}
                      onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-muted)' }}
                      onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }} />
                  </div>
                  <div>
                    <label style={{
                      display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7
                    }}>Password</label>
                    <div style={{ position: 'relative' }}>
                      <input ref={pwRef} value={pw} onChange={e => setPw(e.target.value)}
                        type={showPw ? 'text' : 'password'}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doPassword() } }}
                        placeholder="••••••••"
                        style={{
                          width: '100%', padding: '13px 44px 13px 15px', fontSize: '0.9375rem',
                          background: 'var(--bg-input)', border: '1.5px solid var(--border)',
                          borderRadius: 11, color: 'var(--text-primary)', outline: 'none',
                          transition: 'border-color .2s,box-shadow .2s', fontFamily: 'inherit'
                        }}
                        onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-muted)' }}
                        onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }} />
                      <button type="button" onClick={() => setShowPw(s => !s)}
                        style={{
                          position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0
                        }}>
                        {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                  <Link to="/forgot-password" style={{ fontSize: '0.8125rem', color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
                    Forgot password?
                  </Link>
                </div>
                {/* Turnstile widget (login) */}
                {tsCfg?.siteKey && <div ref={tsRef} style={{ marginBottom: 4 }} />}

                <motion.button type="button" onClick={doPassword} disabled={busy || !id.trim() || !pw || (tsCfg?.siteKey && !tsToken)}
                  whileHover={{ scale: id.trim() && pw && !busy ? 1.015 : 1 }}
                  style={{
                    width: '100%', padding: '13px', borderRadius: 11, border: 'none',
                    fontWeight: 800, fontSize: '0.9375rem', transition: 'all .2s',
                    cursor: (id.trim() && pw && !busy && !(tsCfg?.siteKey && !tsToken)) ? 'pointer' : 'not-allowed',
                    opacity: (id.trim() && pw && !(tsCfg?.siteKey && !tsToken)) ? 1 : 0.45,
                    background: id.trim() && pw ? 'var(--accent)' : 'var(--bg-surface2)',
                    color: id.trim() && pw ? '#fff' : 'var(--text-dim)',
                    boxShadow: id.trim() && pw ? '0 6px 20px var(--accent-muted)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                  }}>
                  {busy
                    ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: .8, repeat: Infinity, ease: 'linear' }}
                      style={{ width: 17, height: 17, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Signing in…</>
                    : <>Sign In <ArrowRight size={16} /></>}
                </motion.button>
              </motion.div>
            )}

          </AnimatePresence>

          <p style={{ marginTop: 20, textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            No account?{' '}
            <Link to="/register" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>
              Start free trial →
            </Link>
          </p>

          {/* IP info banner */}
          {ipInfo && (
            <div style={{
              marginTop: 16, padding: '10px 14px', borderRadius: 10,
              background: 'rgba(88,166,255,.06)', border: '1px solid rgba(88,166,255,.15)',
              fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5, textAlign: 'center',
            }}>
              You are connecting from{' '}
              <strong style={{ color: 'var(--text-secondary)' }}>{ipInfo.org || ipInfo.city}</strong>
              {ipInfo.city && ipInfo.org ? `, ${ipInfo.city}` : ''}
              {ipInfo.country ? ` — ${ipInfo.country}` : ''}{' '}
              with IP address{' '}
              <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{ipInfo.ip}</strong>
            </div>
          )}

          {/* Honeypot — hidden from humans, bots fill it */}
          <input
            type="text" name="_hp" value={hp} onChange={e => setHp(e.target.value)}
            tabIndex={-1} autoComplete="off" aria-hidden="true"
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
          />
        </div>

        {/* <p style={{ position: 'absolute', bottom: 14, fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'monospace', zIndex: 1, textAlign: 'center' }}>
          © {new Date().getFullYear()} {useBrand.getState().appName} · Secure by design
          {useBrand.getState().companyName ? ` · Powered by ${useBrand.getState().companyName}` : ''}
        </p> */}
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

      <TwoFAModal open={show2FA} onClose={() => setShow2FA(false)} onVerify={verify2FA} busy={busy} />
    </div>
  )
}
