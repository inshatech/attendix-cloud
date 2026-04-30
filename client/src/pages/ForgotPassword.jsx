import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail, Lock, ArrowRight, ArrowLeft, CheckCircle2, RefreshCw,
  Sun, Moon, Fingerprint, KeyRound, ShieldCheck, Heart, Eye, EyeOff,
  AlertTriangle, Clock,
} from 'lucide-react'
import { Input } from '../components/ui/Input'
import { OtpInput } from '../components/ui/OtpInput'
import { Toaster, useToast } from '../components/ui/Toast'
import { useTheme } from '../store/theme'
import { useBrand } from '../store/brand'
import api from '../lib/api'

const parseId = v => /^\+?[\d\s\-]{7,15}$/.test(v.trim())
  ? { mobile: v.trim().replace(/\s/g, '') }
  : { email: v.trim().toLowerCase() }

const STEPS = [
  { id: 'request', label: 'Identify' },
  { id: 'verify',  label: 'Verify'   },
  { id: 'done',    label: 'Done'     },
]

function StepIndicator({ current }) {
  const idx = STEPS.findIndex(s => s.id === current)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
      {STEPS.map((s, i) => {
        const done    = i < idx
        const active  = i === idx
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .3s',
                background: done ? 'var(--accent)' : active ? 'var(--accent-muted)' : 'var(--bg-surface2)',
                border: `2px solid ${done || active ? 'var(--accent)' : 'var(--border)'}`,
              }}>
                {done
                  ? <CheckCircle2 size={13} style={{ color: '#fff' }}/>
                  : <span style={{ fontSize: '0.65rem', fontWeight: 800, color: active ? 'var(--accent)' : 'var(--text-dim)' }}>{i + 1}</span>}
              </div>
              <span style={{ fontSize: '0.65rem', fontWeight: active ? 700 : 500, color: active ? 'var(--accent)' : done ? 'var(--text-secondary)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, margin: '0 6px', marginBottom: 18, borderRadius: 99, transition: 'background .4s',
                background: done ? 'var(--accent)' : 'var(--border)' }}/>
            )}
          </div>
        )
      })}
    </div>
  )
}

const INFO_ITEMS = [
  { icon: ShieldCheck, title: 'Secure reset',   desc: 'OTP delivered via SMS or email — never stored in plain text.' },
  { icon: Clock,       title: 'Expires fast',   desc: 'Your reset code is valid for 10 minutes only.'              },
  { icon: AlertTriangle, title: 'Only you',     desc: 'Never share your code — our team will never ask for it.'    },
]

export default function ForgotPassword() {
  const [step, setStep] = useState('request')
  const [id,   setId]   = useState('')
  const [otp,  setOtp]  = useState('')
  const [pw,   setPw]   = useState('')
  const [pw2,  setPw2]  = useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [showPw2, setShowPw2] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sec,  setSec]  = useState(0)
  const [hp,      setHp]     = useState('')           // honeypot
  const [ipInfo,  setIpInfo] = useState(null)
  const [tsToken, setTsToken] = useState('')
  const [tsCfg,   setTsCfg]  = useState(null)
  const tsRef = useRef(null)
  const { toast }             = useToast()
  const { theme, toggle }     = useTheme()
  const { logoUrl, appName, tagline, version, companyName, load } = useBrand()
  const isLight = theme === 'light'
  const ver = version || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0')
  useEffect(() => { load() }, [])

  useEffect(() => {
    if (sec <= 0) return
    const t = setTimeout(() => setSec(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [sec])

  // IP info (non-blocking)
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

  // Turnstile config + widget
  useEffect(() => {
    api.get('/turnstile-config').then(cfg => {
      if (!cfg?.enabled || !cfg?.siteKey || cfg?.onForgotPassword === false) return
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
    if (!tsCfg?.siteKey || !tsRef.current) return
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
  }, [tsCfg])

  async function sendOtp() {
    if (!id.trim()) return toast('Enter email or mobile', 'error')
    setBusy(true)
    try {
      await api.post('/auth/forgot-password', { ...parseId(id), _hp: hp, _turnstile: tsToken })
      setStep('verify'); setOtp(''); setSec(60)
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function reset() {
    if (otp.length !== 6) return toast('Enter 6-digit OTP', 'error')
    if (pw.length < 8)    return toast('Password min 8 characters', 'error')
    if (pw !== pw2)        return toast("Passwords don't match", 'error')
    setBusy(true)
    try {
      await api.post('/auth/reset-password', { ...parseId(id), otp, newPassword: pw })
      setStep('done')
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  const v = {
    hidden:  { opacity: 0, y: 16, scale: .98 },
    visible: { opacity: 1, y: 0,  scale: 1,   transition: { type: 'spring', stiffness: 300, damping: 28 } },
    exit:    { opacity: 0, y: -12, scale: .98, transition: { duration: .16 } },
  }

  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <Toaster/>

      {/* ══ LEFT PANEL ══ */}
      <div className="hidden lg:flex"
        style={{ width: '42%', flexShrink: 0, flexDirection: 'column',
          background: 'var(--bg-surface)', borderRight: '1px solid var(--border)',
          position: 'relative', overflow: 'hidden' }}>

        {/* Grid + glows */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(var(--grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--grid-line) 1px,transparent 1px)',
          backgroundSize: '40px 40px' }}/>
        <div style={{ position: 'absolute', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%',
          background: 'var(--accent-muted)', filter: 'blur(70px)', pointerEvents: 'none' }}/>
        <div style={{ position: 'absolute', bottom: -60, left: -60, width: 220, height: 220, borderRadius: '50%',
          background: 'var(--accent-muted)', filter: 'blur(60px)', pointerEvents: 'none', opacity: .5 }}/>

        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: '2.5rem 2.75rem' }}>

          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
              boxShadow: '0 4px 18px var(--accent-muted)', overflow: 'hidden' }}>
              {logoUrl
                ? <img src={logoUrl} alt={appName} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                : <Fingerprint size={20} style={{ color: 'var(--accent)' }}/>}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{ fontWeight: 900, fontSize: '1.0625rem', color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0 }}>
                  {appName}
                </p>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, fontFamily: 'monospace',
                  color: 'var(--accent)', background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
                  borderRadius: 4, padding: '1px 5px', lineHeight: '1.6', flexShrink: 0 }}>v{ver}</span>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{tagline}</p>
            </div>
          </div>

          {/* Hero copy */}
          <div>
            <motion.div initial={{ scale: .8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22, delay: .1 }}
              style={{ width: 64, height: 64, borderRadius: 18, marginBottom: 24,
                background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <KeyRound size={28} style={{ color: 'var(--accent)' }}/>
            </motion.div>
            <h2 style={{ fontSize: '1.875rem', fontWeight: 900, color: 'var(--text-primary)',
              letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 10 }}>
              Forgot your<br/>
              <span style={{ color: 'var(--accent)' }}>password?</span>
            </h2>
            <p style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>
              No worries. Enter your email or mobile and we'll send you a secure one-time reset code instantly.
            </p>

            {/* Security info cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {INFO_ITEMS.map((item, i) => (
                <motion.div key={item.title}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: .2 + i * .08 }}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                    borderRadius: 11, background: 'var(--bg-surface2)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                    background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <item.icon size={14} style={{ color: 'var(--accent)' }}/>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>{item.title}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'monospace', margin: 0 }}>
              © {new Date().getFullYear()} {appName}
              {companyName ? ` · Powered by ${companyName}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* ══ RIGHT PANEL ══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '2rem', position: 'relative', overflow: 'hidden' }}>

        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(ellipse 70% 50% at 60% 30%, var(--accent-muted) 0%, transparent 70%)' }}/>

        {/* Theme toggle */}
        <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .4 }}
          onClick={toggle} whileHover={{ scale: 1.08 }} whileTap={{ scale: .93 }}
          style={{ position: 'absolute', top: 20, right: 20, width: 38, height: 38, borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-muted)', transition: 'border-color .2s,color .2s',
            boxShadow: 'var(--shadow-card)', zIndex: 2 }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
          {isLight ? <Moon size={16}/> : <Sun size={16}/>}
        </motion.button>

        {/* Mobile brand header */}
        <div className="lg:hidden" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, position: 'relative', zIndex: 1 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {logoUrl
              ? <img src={logoUrl} alt={appName} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              : <Fingerprint size={17} style={{ color: 'var(--accent)' }}/>}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{appName}</span>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)', background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', borderRadius: 4, padding: '1px 5px' }}>v{ver}</span>
            </div>
            {tagline && <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{tagline}</p>}
          </div>
        </div>

        {/* Form */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: .1, type: 'spring', stiffness: 240, damping: 26 }}
          style={{ width: '100%', maxWidth: 380, position: 'relative', zIndex: 1 }}>

              {/* Step indicator — hidden on done */}
              {step !== 'done' && <StepIndicator current={step}/>}

              <AnimatePresence mode="wait">

                {/* ── Step 1: Request ── */}
                {step === 'request' && (
                  <motion.div key="req" variants={v} initial="hidden" animate="visible" exit="exit">
                    <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none',
                      marginBottom: 20, transition: 'color .15s' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                      <ArrowLeft size={13}/> Back to sign in
                    </Link>

                    <h2 style={{ fontSize: '1.625rem', fontWeight: 900, color: 'var(--text-primary)',
                      letterSpacing: '-0.04em', marginBottom: 6 }}>Reset password</h2>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 22, lineHeight: 1.6 }}>
                      Enter your registered email or mobile number.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <Input label="Email or Mobile" icon={Mail} value={id}
                        onChange={e => setId(e.target.value)}
                        placeholder="you@company.com or +91 98765 43210"
                        onKeyDown={e => e.key === 'Enter' && sendOtp()}/>

                      {/* Turnstile widget */}
                      {tsCfg?.siteKey && <div ref={tsRef} />}

                      <motion.button onClick={sendOtp} disabled={busy || !id.trim() || (tsCfg?.siteKey && !tsToken)}
                        whileHover={{ scale: id.trim() && !busy ? 1.015 : 1 }} whileTap={{ scale: .975 }}
                        style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                          fontWeight: 800, fontSize: '0.9375rem', cursor: (busy || !id.trim() || (tsCfg?.siteKey && !tsToken)) ? 'not-allowed' : 'pointer',
                          opacity: (!id.trim() || busy || (tsCfg?.siteKey && !tsToken)) ? .5 : 1,
                          background: id.trim() ? 'var(--accent)' : 'var(--bg-surface2)',
                          color: id.trim() ? '#fff' : 'var(--text-dim)',
                          boxShadow: id.trim() ? '0 6px 20px var(--accent-muted)' : 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .2s' }}>
                        {busy
                          ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: .8, repeat: Infinity, ease: 'linear' }}
                              style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff' }}/> Sending…</>
                          : <>Send Reset Code <ArrowRight size={16}/></>}
                      </motion.button>

                      {/* IP info */}
                      {ipInfo && (
                        <div style={{
                          padding: '9px 13px', borderRadius: 10,
                          background: 'rgba(88,166,255,.06)', border: '1px solid rgba(88,166,255,.15)',
                          fontSize: '0.73rem', color: 'var(--text-muted)', lineHeight: 1.5, textAlign: 'center',
                        }}>
                          Connecting from{' '}
                          <strong style={{ color: 'var(--text-secondary)' }}>{ipInfo.org || ipInfo.city}</strong>
                          {ipInfo.country ? `, ${ipInfo.country}` : ''}{' '}·{' '}
                          <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{ipInfo.ip}</strong>
                        </div>
                      )}

                      {/* Honeypot */}
                      <input type="text" name="_hp" value={hp} onChange={e => setHp(e.target.value)}
                        tabIndex={-1} autoComplete="off" aria-hidden="true"
                        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
                    </div>
                  </motion.div>
                )}

                {/* ── Step 2: Verify ── */}
                {step === 'verify' && (
                  <motion.div key="verify" variants={v} initial="hidden" animate="visible" exit="exit">
                    <motion.button onClick={() => setStep('request')} whileHover={{ x: -3 }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem',
                        fontWeight: 600, color: 'var(--text-muted)', background: 'none', border: 'none',
                        cursor: 'pointer', marginBottom: 20, padding: 0 }}>
                      <ArrowLeft size={13}/> Back
                    </motion.button>

                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)',
                      letterSpacing: '-0.04em', marginBottom: 6 }}>Verify &amp; set password</h2>

                    {/* Sent-to badge */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px',
                      borderRadius: 99, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)',
                      marginBottom: 20 }}>
                      <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1.6, repeat: Infinity }}
                        style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }}/>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>
                        Code sent to <strong>{id}</strong>
                      </span>
                    </div>

                    {/* OTP section */}
                    <div style={{ background: 'var(--bg-surface2)', border: '1px solid var(--border)',
                      borderRadius: 12, padding: '16px', marginBottom: 16 }}>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, margin: '0 0 12px' }}>
                        Enter 6-digit OTP
                      </p>
                      <OtpInput value={otp} onChange={setOtp} autoFocus/>
                      <div style={{ textAlign: 'center', marginTop: 10 }}>
                        {sec > 0
                          ? <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace', margin: 0 }}>
                              Resend in <strong style={{ color: 'var(--text-primary)' }}>{sec}s</strong>
                            </p>
                          : <button onClick={sendOtp}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem',
                                color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                              <RefreshCw size={12}/> Resend code
                            </button>}
                      </div>
                    </div>

                    {/* Password section */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                      <div style={{ position: 'relative' }}>
                        <Input label="New Password" icon={Lock} type={showPw ? 'text' : 'password'}
                          value={pw} onChange={e => setPw(e.target.value)} placeholder="min 8 characters"/>
                        <button onClick={() => setShowPw(s => !s)} tabIndex={-1}
                          style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(4px)',
                            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                          {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                        </button>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <Input label="Confirm Password" icon={Lock} type={showPw2 ? 'text' : 'password'}
                          value={pw2} onChange={e => setPw2(e.target.value)} placeholder="repeat password"
                          onKeyDown={e => e.key === 'Enter' && reset()}/>
                        <button onClick={() => setShowPw2(s => !s)} tabIndex={-1}
                          style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(4px)',
                            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                          {showPw2 ? <EyeOff size={15}/> : <Eye size={15}/>}
                        </button>
                      </div>
                    </div>

                    <motion.button onClick={reset} disabled={busy || otp.length !== 6 || !pw || !pw2}
                      whileHover={{ scale: otp.length === 6 && pw && pw2 && !busy ? 1.015 : 1 }} whileTap={{ scale: .975 }}
                      style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                        fontWeight: 800, fontSize: '0.9375rem',
                        cursor: busy || otp.length !== 6 || !pw || !pw2 ? 'not-allowed' : 'pointer',
                        opacity: otp.length === 6 && pw && pw2 && !busy ? 1 : .4,
                        background: otp.length === 6 && pw && pw2 ? 'var(--accent)' : 'var(--bg-surface2)',
                        color: otp.length === 6 && pw && pw2 ? '#fff' : 'var(--text-dim)',
                        boxShadow: otp.length === 6 && pw && pw2 ? '0 6px 20px var(--accent-muted)' : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .2s' }}>
                      {busy
                        ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: .8, repeat: Infinity, ease: 'linear' }}
                            style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff' }}/> Resetting…</>
                        : <>Reset Password <ArrowRight size={16}/></>}
                    </motion.button>
                  </motion.div>
                )}

                {/* ── Step 3: Done ── */}
                {step === 'done' && (
                  <motion.div key="done" variants={v} initial="hidden" animate="visible"
                    style={{ textAlign: 'center', padding: '12px 0 8px' }}>
                    <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 18, delay: .1 }}
                      style={{ width: 76, height: 76, borderRadius: 24, margin: '0 auto 20px',
                        background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle2 size={34} style={{ color: '#22c55e' }}/>
                    </motion.div>
                    <h2 style={{ fontSize: '1.875rem', fontWeight: 900, color: 'var(--text-primary)',
                      letterSpacing: '-0.04em', marginBottom: 8 }}>All done!</h2>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.65 }}>
                      Your password has been reset successfully.
                    </p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: 28, lineHeight: 1.5 }}>
                      You can now sign in with your new password.
                    </p>
                    <Link to="/login">
                      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .97 }}
                        style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                          fontWeight: 800, fontSize: '0.9375rem', cursor: 'pointer',
                          background: 'var(--accent)', color: '#fff',
                          boxShadow: '0 6px 20px var(--accent-muted)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        Sign In Now <ArrowRight size={16}/>
                      </motion.button>
                    </Link>
                  </motion.div>
                )}

              </AnimatePresence>

        </motion.div>

        {/* Footer */}
        <div style={{ position: 'absolute', bottom: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>© {new Date().getFullYear()} {appName} | </p>
            <Heart size={10} style={{ color: '#58a6ff', fill: '#58a6ff' }}/>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>
              Powered by:{' '}
              <Link to="https://www.inshatech.com" style={{ color: 'var(--text-primary)' }} target="_blank" rel="noopener noreferrer">
                <strong style={{ color: 'var(--text-secondary)' }}>{companyName || 'Insha Technologies'}</strong>
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
