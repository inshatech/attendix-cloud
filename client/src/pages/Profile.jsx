import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  User, Mail, Smartphone, Briefcase, Building2,
  Lock, Save, Shield, Clock, LogOut, CheckCircle2,
  QrCode, AlertTriangle, RefreshCw, Eye, EyeOff
} from 'lucide-react'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { OtpInput } from '../components/ui/OtpInput'
import { ImageUpload } from '../components/ui/ImageUpload'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { useAuth } from '../store/auth'
import { UserPage } from '../components/ui/UserUI'
import { fmtDate, timeAgo } from '../lib/utils'
import api from '../lib/api'

function Section({ title, description, children }) {
  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:14, padding:'1.5rem', display:'flex', flexDirection:'column', gap:'1.25rem', boxShadow:'var(--shadow-card)' }}>
      <div style={{ paddingBottom:'1rem', borderBottom:'1px solid var(--border)' }}>
        <h2 style={{ fontWeight:700, fontSize:'1rem', color:'var(--text-primary)' }}>{title}</h2>
        {description && <p style={{ fontSize:'0.75rem', fontFamily:'monospace', color:'var(--text-muted)', marginTop:4 }}>{description}</p>}
      </div>
      {children}
    </div>
  )
}

function InfoRow({ icon: Icon, label, value, badge, mono }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px', borderRadius:10, background:'var(--bg-surface2)', border:'1px solid var(--border)' }}>
      <Icon size={14} style={{ color:'var(--text-muted)', marginTop:2, flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:'0.625rem', fontFamily:'monospace', color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.1em' }}>{label}</p>
        <p style={{ fontSize:'0.875rem', color:'var(--text-secondary)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily: mono ? 'monospace' : 'inherit', fontSize: mono ? '0.8125rem' : '0.875rem' }}>{value || '—'}</p>
      </div>
      {badge && <Badge variant={badge.v} style={{ flexShrink:0, fontSize:'0.625rem' }}>{badge.l}</Badge>}
    </div>
  )
}

export default function Profile() {
  const { user, ready, patchUser } = useAuth()
  const { toast } = useToast()

  const [profile,    setProfile]  = useState(null)
  const [loading,    setLoad]     = useState(true)
  const [avatarLoad, setAvtLoad]  = useState(false)
  const [infoSave,   setInfoSave] = useState(false)
  const [pwSave,     setPwSave]   = useState(false)

  const [info, setInfo] = useState({ name: '', bio: '', designation: '', department: '' })
  const [pw,   setPw]   = useState({ current: '', next: '', confirm: '' })
  const [showPw, setShowPw] = useState(false)

  const [mobileOtp,  setMobileOtp]  = useState('')
  const [mobileStep, setMobileStep] = useState('idle')
  const [mobileBusy, setMobBusy]    = useState(false)

  const [emailOtp,   setEmailOtp]   = useState('')
  const [emailStep,  setEmailStep]  = useState('idle')
  const [emailBusy,  setEmlBusy]    = useState(false)

  const [twofa,       setTwofa]     = useState(null)
  const [qrModal,     setQrModal]   = useState(false)
  const [qrData,      setQrData]    = useState(null)
  const [totpCode,    setTotpCode]  = useState('')
  const [disModal,    setDisModal]  = useState(false)
  const [disCode,     setDisCode]   = useState('')
  const [tfaBusy,     setTfaBusy]   = useState(false)
  const [backupCodes, setBackup]    = useState(null)

  async function load() {
    setLoad(true)
    try {
      const [pr, tfr] = await Promise.allSettled([
        api.get('/user/profile'),
        api.get('/user/2fa/status'),
      ])
      if (pr.status === 'fulfilled') {
        const d = pr.value.data
        setProfile(d)
        setInfo({ name: d.name || '', bio: d.bio || '', designation: d.designation || '', department: d.department || '' })
      }
      if (tfr.status === 'fulfilled') setTwofa(tfr.value.data)
    } catch (e) { toast(e.message, 'error') }
    setLoad(false)
  }

  useEffect(() => { if (ready) load() }, [ready])

  async function handleAvatar(base64) {
    setAvtLoad(true)
    try {
      const r = await api.post('/user/profile/avatar', { image: base64 })
      setProfile(p => ({ ...p, avatarUrl: r.avatarUrl }))
      patchUser({ avatarUrl: r.avatarUrl })
      toast(`Avatar updated · ${r.size} · ${r.dimensions}`, 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setAvtLoad(false) }
  }

  async function removeAvatar() {
    setAvtLoad(true)
    try {
      await api.delete('/user/profile/avatar')
      setProfile(p => ({ ...p, avatarUrl: null }))
      patchUser({ avatarUrl: null })
      toast('Avatar removed', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setAvtLoad(false) }
  }

  async function saveInfo() {
    if (!info.name.trim()) return toast('Name cannot be empty', 'error')
    setInfoSave(true)
    try {
      const r = await api.patch('/user/profile', info)
      setProfile(r.data)
      patchUser({ name: r.data.name })
      toast('Profile updated', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setInfoSave(false) }
  }

  async function changePw() {
    if (!pw.current)         return toast('Enter current password', 'error')
    if (pw.next.length < 8)  return toast('New password min 8 characters', 'error')
    if (pw.next !== pw.confirm) return toast('Passwords do not match', 'error')
    setPwSave(true)
    try {
      await api.post('/auth/change-password', { currentPassword: pw.current, newPassword: pw.next })
      toast('Password changed. All devices signed out.', 'success')
      setPw({ current: '', next: '', confirm: '' })
    } catch (e) { toast(e.message, 'error') }
    finally { setPwSave(false) }
  }

  async function sendMobileOtp() {
    setMobBusy(true)
    try {
      await api.post('/user/verify-mobile/request')
      setMobileStep('sent'); setMobileOtp('')
      toast(`OTP sent to ${profile.mobile}`, 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setMobBusy(false) }
  }

  async function confirmMobileOtp() {
    if (mobileOtp.length !== 6) return toast('Enter all 6 digits', 'error')
    setMobBusy(true)
    try {
      await api.post('/user/verify-mobile/confirm', { otp: mobileOtp })
      setProfile(p => ({ ...p, mobileVerified: true }))
      setMobileStep('done')
      toast('Mobile number verified!', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setMobBusy(false) }
  }

  async function sendEmailOtp() {
    setEmlBusy(true)
    try {
      await api.post('/user/verify-email/request')
      setEmailStep('sent'); setEmailOtp('')
      toast(`OTP sent to ${profile.email}`, 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setEmlBusy(false) }
  }

  async function confirmEmailOtp() {
    if (emailOtp.length !== 6) return toast('Enter all 6 digits', 'error')
    setEmlBusy(true)
    try {
      await api.post('/user/verify-email/confirm', { otp: emailOtp })
      setProfile(p => ({ ...p, emailVerified: true }))
      setEmailStep('done')
      toast('Email address verified!', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setEmlBusy(false) }
  }

  async function setup2FA() {
    setTfaBusy(true)
    try {
      const r = await api.post('/user/2fa/setup')
      setQrData({ qrDataUrl: r.qrDataUrl, secret: r.secret })
      setTotpCode(''); setQrModal(true)
    } catch (e) { toast(e.message, 'error') }
    finally { setTfaBusy(false) }
  }

  async function enable2FA() {
    if (totpCode.length !== 6) return toast('Enter the 6-digit code from your authenticator', 'error')
    setTfaBusy(true)
    try {
      const r = await api.post('/user/2fa/enable', { totpToken: totpCode })
      setBackup(r.backupCodes)
      setTwofa(t => ({ ...t, userEnabled: true }))
      setProfile(p => ({ ...p, totpEnabled: true }))
      setQrModal(false)
      toast('2FA enabled!', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setTfaBusy(false) }
  }

  async function disable2FA() {
    if (disCode.length !== 6) return toast('Enter the 6-digit authenticator code', 'error')
    setTfaBusy(true)
    try {
      await api.post('/user/2fa/disable', { totpToken: disCode })
      setTwofa(t => ({ ...t, userEnabled: false }))
      setProfile(p => ({ ...p, totpEnabled: false }))
      setDisModal(false); setDisCode('')
      toast('2FA disabled', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setTfaBusy(false) }
  }

  const si = k => e => setInfo(f => ({ ...f, [k]: e.target.value }))
  const sp = k => e => setPw(f => ({ ...f, [k]: e.target.value }))
  const roleColor = { admin: 'lime', support: 'blue', user: 'gray' }

  if (loading) return (
    <UserPage>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ height:160, borderRadius:14, background:'var(--bg-surface2)', animation:'shimmer-pulse 1.5s ease-in-out infinite' }}/>
      ))}
      <style>{`@keyframes shimmer-pulse{0%,100%{opacity:.4}50%{opacity:.9}}`}</style>
    </UserPage>
  )

  return (
    <UserPage>
      <div>
        <h1 style={{ fontSize:'1.875rem', fontWeight:800, color:'var(--text-primary)', letterSpacing:'-0.03em', display:'flex', alignItems:'center', gap:10 }}><User size={26} style={{ color:'#58a6ff' }}/> My Profile</h1>
        <p style={{ fontSize:'0.9rem', color:'var(--text-muted)', marginTop:6 }}>Avatar, info, security and 2FA settings</p>
      </div>

      <Section title="Photo & Identity" description="// your profile photo and display info">
        <div className="flex flex-col sm:flex-row gap-8 items-start">
          <div className="flex flex-col items-center gap-3 flex-shrink-0">
            <ImageUpload value={profile?.avatarUrl} onChange={handleAvatar}
              onRemove={profile?.avatarUrl ? removeAvatar : undefined}
              shape="circle" loading={avatarLoad} hint="200×200px · WebP · max 5MB" />
            <div className="text-center">
              <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontWeight:600 }}>{profile?.name}</p>
              <Badge variant={roleColor[profile?.role] || 'gray'} className="mt-1 text-[10px]">{profile?.role}</Badge>
            </div>
          </div>
          <div className="flex-1 w-full" style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <Input label="Full Name *"  icon={User}      value={info.name}        onChange={si('name')}        placeholder="Jane Smith" />
            <Input label="Designation" icon={Briefcase}  value={info.designation} onChange={si('designation')} placeholder="HR Manager" />
            <Input label="Department"  icon={Building2}  value={info.department}  onChange={si('department')}  placeholder="Human Resources" />
            <div>
              <label className="field-label">Bio</label>
              <textarea value={info.bio} onChange={si('bio')} placeholder="A short bio…" rows={3} className="field-input resize-none" />
            </div>
            <Button onClick={saveInfo} loading={infoSave} size="sm"><Save size={14} /> Save Changes</Button>
          </div>
        </div>
      </Section>

      <Section title="Account Details" description="// contact info · verification status">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:10 }}>
          <InfoRow icon={Mail}       label="Email"        value={profile?.email}  badge={profile?.emailVerified  ? { v: 'green', l: 'Verified' } : { v: 'orange', l: 'Unverified' }} />
          <InfoRow icon={Smartphone} label="Mobile"       value={profile?.mobile} badge={profile?.mobileVerified ? { v: 'green', l: 'Verified' } : { v: 'orange', l: 'Unverified' }} />
          <InfoRow icon={User}       label="User ID"      value={profile?.userId} mono />
          <InfoRow icon={Clock}      label="Member since" value={fmtDate(profile?.createdAt)} />
          <InfoRow icon={Clock}      label="Last login"   value={timeAgo(profile?.lastLoginAt)} />
          <InfoRow icon={Shield}     label="2FA"          value={profile?.totpEnabled ? 'Enabled' : 'Disabled'} badge={profile?.totpEnabled ? { v: 'green', l: 'Active' } : { v: 'gray', l: 'Off' }} />
        </div>
      </Section>

      {profile?.mobile && !profile?.mobileVerified && (
        <Section title="Verify Mobile Number" description={`// verify ${profile.mobile}`}>
          {mobileStep === 'idle' && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <AlertTriangle size={16} style={{ color:'#fb923c', flexShrink:0 }} />
                <p style={{ fontSize:'0.875rem', color:'var(--text-secondary)' }}>Your mobile number is not verified.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={sendMobileOtp} loading={mobileBusy}>
                <Smartphone size={13} /> Send OTP to {profile.mobile}
              </Button>
            </div>
          )}
          {mobileStep === 'sent' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <p style={{ fontSize:'0.875rem', color:'var(--text-muted)' }}>OTP sent to <span style={{ color:'var(--text-primary)', fontFamily:'monospace' }}>{profile.mobile}</span></p>
              <OtpInput value={mobileOtp} onChange={setMobileOtp} />
              <div style={{ display:'flex', gap:8 }}>
                <Button size="sm" onClick={confirmMobileOtp} loading={mobileBusy}>Verify Mobile</Button>
                <Button size="sm" variant="secondary" onClick={sendMobileOtp} loading={mobileBusy}><RefreshCw size={12} /> Resend</Button>
              </div>
            </div>
          )}
          {mobileStep === 'done' && (
            <div style={{ display:'flex', alignItems:'center', gap:10, color:'#34d399' }}><CheckCircle2 size={18} /><p style={{ fontSize:'0.875rem', fontWeight:600 }}>Mobile verified!</p></div>
          )}
        </Section>
      )}

      {profile?.email && !profile?.emailVerified && (
        <Section title="Verify Email Address" description={`// verify ${profile.email}`}>
          {emailStep === 'idle' && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <AlertTriangle size={16} style={{ color:'#fb923c', flexShrink:0 }} />
                <p style={{ fontSize:'0.875rem', color:'var(--text-secondary)' }}>Your email is not verified.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={sendEmailOtp} loading={emailBusy}>
                <Mail size={13} /> Send OTP to {profile.email}
              </Button>
            </div>
          )}
          {emailStep === 'sent' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <p style={{ fontSize:'0.875rem', color:'var(--text-muted)' }}>OTP sent to <span style={{ color:'var(--text-primary)', fontFamily:'monospace' }}>{profile.email}</span></p>
              <OtpInput value={emailOtp} onChange={setEmailOtp} />
              <div style={{ display:'flex', gap:8 }}>
                <Button size="sm" onClick={confirmEmailOtp} loading={emailBusy}>Verify Email</Button>
                <Button size="sm" variant="secondary" onClick={sendEmailOtp} loading={emailBusy}><RefreshCw size={12} /> Resend</Button>
              </div>
            </div>
          )}
          {emailStep === 'done' && (
            <div style={{ display:'flex', alignItems:'center', gap:10, color:'#34d399' }}><CheckCircle2 size={18} /><p style={{ fontSize:'0.875rem', fontWeight:600 }}>Email verified!</p></div>
          )}
        </Section>
      )}

      {twofa && (
        <Section title="Two-Factor Authentication" description="// Google Authenticator / Authy TOTP">
          {!twofa.platformEnabled ? (
            <div style={{ display:"flex", alignItems:"center", gap:12, color:"var(--text-muted)" }}><Shield size={16} /><p style={{ fontSize:"0.875rem", color:"var(--text-secondary)" }}>2FA is not enabled on this platform. Ask admin to enable it in Admin → Plugins.</p></div>
          ) : twofa.userEnabled ? (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:16, borderRadius:12, background:'rgba(22,163,74,.08)', border:'1px solid rgba(22,163,74,.2)' }}>
                <CheckCircle2 size={20} style={{ color:'#34d399', flexShrink:0 }} />
                <div><p style={{ fontSize:'0.875rem', fontWeight:600, color:'#34d399' }}>2FA is active</p><p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:2 }}>Your account is protected with an authenticator app.</p></div>
              </div>
              <Button size="sm" variant="danger" onClick={() => { setDisModal(true); setDisCode('') }}><Shield size={13} /> Disable 2FA</Button>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:16, borderRadius:12, background:'rgba(217,119,6,.08)', border:'1px solid rgba(217,119,6,.2)' }}>
                <AlertTriangle size={18} style={{ color:'#fb923c', flexShrink:0 }} />
                <div><p style={{ fontSize:'0.875rem', fontWeight:600, color:'#d97706' }}>2FA is not enabled</p><p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:2 }}>Add extra security to your account.</p></div>
              </div>
              <Button size="sm" onClick={setup2FA} loading={tfaBusy}><QrCode size={13} /> Enable Two-Factor Auth</Button>
            </div>
          )}
        </Section>
      )}

      {backupCodes && (
        <Section title="2FA Backup Codes" description="// save these securely — shown only once">
          <div style={{ background:"var(--bg-surface2)", borderRadius:12, padding:16, border:"1px solid rgba(101,163,13,.25)" }}>
            <p style={{ fontSize:"0.75rem", color:"var(--text-muted)", fontFamily:"monospace", marginBottom:16 }}>Each code can be used once if you lose your authenticator.</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {backupCodes.map((c, i) => (
                <div key={i} style={{ fontFamily:'monospace', fontSize:'0.875rem', color:'#65a30d', background:'var(--bg-surface)', borderRadius:8, padding:'6px 12px', border:'1px solid var(--border)', textAlign:'center', letterSpacing:'0.15em' }}>{c}</div>
              ))}
            </div>
            <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(backupCodes.join('\n')); toast('Copied!', 'success') }}>Copy All</Button>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setBackup(null)}>Dismiss — I've saved them</Button>
        </Section>
      )}

      <Section title="Change Password" description="// you'll be signed out of all devices">
        <div className="max-w-sm" style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Input label="Current Password" icon={Lock} type={showPw ? 'text' : 'password'} value={pw.current} onChange={sp('current')} placeholder="••••••••" autoComplete="current-password" />
          <Input label="New Password"     icon={Lock} type={showPw ? 'text' : 'password'} value={pw.next}    onChange={sp('next')}    placeholder="min 8 characters" autoComplete="new-password" />
          <Input label="Confirm New"      icon={Lock} type={showPw ? 'text' : 'password'} value={pw.confirm} onChange={sp('confirm')} placeholder="repeat" autoComplete="new-password" onKeyDown={e => e.key === 'Enter' && changePw()} />
          <div className="flex items-center gap-3">
            <Button onClick={changePw} loading={pwSave} variant="secondary" size="sm"><Lock size={13} /> Update Password</Button>
            <button onClick={() => setShowPw(v => !v)} style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontFamily:'monospace', display:'flex', alignItems:'center', gap:4, background:'transparent', border:'none', cursor:'pointer' }}>
              {showPw ? <EyeOff size={12} /> : <Eye size={12} />} {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      </Section>

      <Section title="Active Sessions" description="// sign out everywhere if account is compromised">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <p style={{ fontSize:'0.875rem', color:'var(--text-muted)' }}>Sign out from all devices except the current one.</p>
          <Button variant="danger" size="sm" onClick={async () => {
            try { await api.delete('/user/sessions'); toast('All sessions revoked', 'success') }
            catch (e) { toast(e.message, 'error') }
          }}><LogOut size={13} /> Sign Out All</Button>
        </div>
      </Section>

      <Modal open={qrModal} onClose={() => setQrModal(false)} title="Set Up Two-Factor Auth" description="Scan QR code in Google Authenticator or Authy" size="sm">
        {qrData && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'flex', justifyContent:'center' }}>
              <div style={{ padding:12, background:'#fff', borderRadius:12, display:'inline-block' }}>
                <img src={qrData.qrDataUrl} alt="QR Code" style={{ width:192, height:192, display:'block' }} />
              </div>
            </div>
            <div style={{ textAlign:'center' }}>
              <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontFamily:'monospace', marginBottom:6 }}>Or enter manually:</p>
              <p style={{ fontFamily:'monospace', fontSize:'0.875rem', color:'#65a30d', background:'var(--bg-surface2)', borderRadius:8, padding:'6px 12px', border:'1px solid var(--border)', letterSpacing:'0.15em', wordBreak:'break-all' }}>{qrData.secret}</p>
            </div>
            <div>
              <p className="field-label" style={{ marginBottom:10 }}>Enter the 6-digit code from your app</p>
              <OtpInput value={totpCode} onChange={setTotpCode} />
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <Button variant="secondary" size="sm" onClick={() => setQrModal(false)}>Cancel</Button>
              <Button size="sm" onClick={enable2FA} loading={tfaBusy}>Activate 2FA</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={disModal} onClose={() => setDisModal(false)} title="Disable Two-Factor Auth" description="Enter your authenticator code to confirm" size="sm">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ padding:12, borderRadius:12, background:'rgba(217,119,6,.08)', border:'1px solid rgba(217,119,6,.2)', display:'flex', alignItems:'center', gap:8 }}>
            <AlertTriangle size={15} style={{ color:'#fb923c', flexShrink:0 }} />
            <p style={{ fontSize:'0.8rem', color:'#fb923c' }}>Disabling 2FA makes your account less secure.</p>
          </div>
          <OtpInput value={disCode} onChange={setDisCode} />
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <Button variant="secondary" size="sm" onClick={() => setDisModal(false)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={disable2FA} loading={tfaBusy}>Disable 2FA</Button>
          </div>
        </div>
      </Modal>
    </UserPage>
  )
}
