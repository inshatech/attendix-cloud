import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plug, Smartphone, MessageSquare, MessageCircle, Mail, Shield, Image, Globe2, Wifi, ChevronDown, ChevronUp, TestTube, CheckCircle2, RefreshCw, XCircle, AlertTriangle, CreditCard, Zap, Info, Plus, Trash2, Building2, Users, Star, Phone, MapPin, Link, Upload, FileUp, HardDrive } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { AdminPage, PageHeader, StatCard, SearchBox } from '../../components/admin/AdminUI'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../store/auth'
import { cn } from '../../lib/utils'
import api from '../../lib/api'

const META = {
  google_calendar: { icon: Globe2,        label: 'Google Calendar', color: '#4285f4', desc: 'Sync Indian public holidays — auto-marks attendance.' },
  cloudinary:      { icon: Image,         label: 'Cloudinary',      color: '#3448c5', desc: 'Cloud image storage for avatars & org logos.' },
  sms:             { icon: Smartphone,    label: 'SMS Gateway',     color: '#58a6ff', desc: 'InshaTech transactional SMS, bulk & DLT support.' },
  whatsapp:        { icon: MessageSquare, label: 'WhatsApp',        color: '#25d366', desc: 'Meta WhatsApp Business API — OTP templates.' },
  smtp:            { icon: Mail,          label: 'Email (SMTP)',    color: '#fb923c', desc: 'Nodemailer SMTP — Gmail shortcut or any provider.' },
  totp_2fa:        { icon: Shield,        label: 'Two-Factor Auth', color: '#c084fc', desc: 'Google Authenticator TOTP. Enforce per role.' },
  about_us:    { icon: Info,   label: 'About Us Page',       color:'#f472b6', desc:'Configure public About page — app info, company, mission, features, team & contact.' },
  // Live Chat
  bridge_app:  { icon: Wifi,   label: 'Bridge App Settings', color:'#58a6ff', desc:'Windows desktop bridge — download link, version, file size, and server credentials shown to users on the Bridge Setup page.' },
  google_auth: { icon: Globe2, label: 'Google Sign-In', color:'#4285f4', desc:'Allow users to sign in with their Google account via OAuth 2.0.' },
  tawk:      { icon: MessageCircle, label: 'Tawk.to Live Chat', color: '#03a84e', desc: 'Free live chat widget for users. Manage from tawk.to dashboard.', category: 'chat' },
  // Payment Gateways
  razorpay:  { icon: CreditCard, label: 'Razorpay',  color: '#2d82f5', desc: 'UPI, cards, netbanking, wallets. Auto-activates subscription on payment.', category: 'payment' },
  phonepe:   { icon: Zap,        label: 'PhonePe',   color: '#5f259f', desc: 'UPI-first payment gateway. Webhook auto-activates subscriptions.', category: 'payment' },
  paytm:     { icon: CreditCard, label: 'Paytm',     color: '#00b9f1', desc: 'UPI, wallets, EMI, cards. Auto-activates subscription via webhook.', category: 'payment' },
  ccavenue:  { icon: CreditCard, label: 'CCAvenue',  color: '#e8703a', desc: '200+ payment options. AES-256 encrypted. Auto-activates on success.', category: 'payment' },
}

const FIELDS = {
  google_calendar: [
    { k:'apiKey',        l:'Google API Key',             t:'password', ph:'AIza...' },
    { k:'calendarId',    l:'Indian Holidays Calendar ID', t:'text',     ph:'en.indian#holiday@group.v.calendar.google.com' },
    { k:'orgCalendarId', l:'Custom Calendar ID',          t:'text',     ph:'your-calendar@group.v.calendar.google.com (optional)' },
    { k:'syncMonths',    l:'Sync Months Ahead',           t:'number',   ph:'3' },
  ],
  cloudinary: [
    { k:'cloudName',    l:'Cloud Name',      t:'text',     ph:'your-cloud-name' },
    { k:'apiKey',       l:'API Key',          t:'text',     ph:'123456789012345' },
    { k:'apiSecret',    l:'API Secret',       t:'password', ph:'••••••••' },
    { k:'uploadPreset', l:'Upload Preset',    t:'text',     ph:'attendance_gateway' },
    { k:'folder',       l:'Default Folder',   t:'text',     ph:'attendance' },
  ],
  sms: [
    { k:'username',   l:'Username',       t:'text',     ph:'InshaTech username' },
    { k:'apiKey',     l:'API Key',         t:'password', ph:'••••••••' },
    { k:'sender',     l:'Sender ID',       t:'text',     ph:'ATTEND' },
    { k:'route',      l:'Route',           t:'text',     ph:'Trans' },
    { k:'templateId', l:'DLT Template ID', t:'text',     ph:'1234567890' },
    { k:'baseUrl',    l:'Base URL',         t:'text',     ph:'https://...' },
  ],
  whatsapp: [
    { k:'phoneNumberId', l:'Phone Number ID', t:'text',     ph:'Meta phone ID' },
    { k:'apiKey',        l:'Bearer Token',    t:'password', ph:'••••••••' },
    { k:'templateId',    l:'Template Name',   t:'text',     ph:'otp_verification' },
    { k:'version',       l:'API Version',     t:'text',     ph:'v19.0' },
    { k:'baseUrl',       l:'Base URL',         t:'text',     ph:'https://graph.facebook.com' },
  ],
  smtp: [
    { k:'service', l:'Service',           t:'text',     ph:'gmail (or leave blank)' },
    { k:'host',    l:'SMTP Host',          t:'text',     ph:'smtp.brevo.com' },
    { k:'port',    l:'Port',              t:'number',   ph:'587' },
    { k:'user',    l:'Username',           t:'text',     ph:'your@email.com' },
    { k:'pass',    l:'Password / App Key', t:'password', ph:'••••••••' },
    { k:'from',    l:'From Address',       t:'text',     ph:'Gateway <no-reply@example.com>' },
  ],
  totp_2fa: [
    { k:'issuer', l:'App Name (shown in authenticator)', t:'text', ph:'AttendanceGateway' },
  ],
  razorpay: [
    { k:'keyId',         l:'Key ID',              t:'text',     ph:'rzp_live_xxxxxxxxxxxx' },
    { k:'keySecret',     l:'Key Secret',           t:'password', ph:'••••••••' },
    { k:'webhookSecret', l:'Webhook Secret',       t:'password', ph:'••••••••' },
    { k:'currency',      l:'Currency',             t:'text',     ph:'INR' },
  ],
  phonepe: [
    { k:'merchantId',  l:'Merchant ID (Production)',  t:'text',     ph:'Your PhonePe Merchant ID (e.g. MYMERCHANT01)' },
    { k:'saltKey',     l:'Salt Key (Production)',      t:'password', ph:'••••••••' },
    { k:'saltIndex',   l:'Salt Index',                 t:'text',     ph:'1' },
    { k:'callbackUrl', l:'Webhook Callback URL',       t:'text',     ph:'https://yourserver.com/webhooks/phonepe' },
    { k:'environment', l:'Environment (production / sandbox)', t:'text', ph:'production' },
  ],
  paytm: [
    { k:'merchantId',  l:'Merchant ID',     t:'text',     ph:'YourMID' },
    { k:'merchantKey', l:'Merchant Key',    t:'password', ph:'••••••••' },
    { k:'website',     l:'Website Name',    t:'text',     ph:'DEFAULT' },
    { k:'callbackUrl', l:'Callback URL',    t:'text',     ph:'https://yourserver.com/webhooks/paytm' },
    { k:'environment', l:'Environment',     t:'text',     ph:'production' },
  ],
  bridge_app: [
    { k:'downloadUrl',  l:'Download URL (.exe)',       t:'text',     ph:'https://cdn.yoursite.com/AttendanceGateway-Bridge-Setup.exe' },
    { k:'version',      l:'Version',                   t:'text',     ph:'1.0.0' },
    { k:'fileSizeMb',   l:'File Size (e.g. 48 MB)',    t:'text',     ph:'48 MB' },
    { k:'wsUrl',        l:'WebSocket Server URL',       t:'text',     ph:'wss://yourdomain.com/bridge' },
    { k:'apiUrl',       l:'Server API URL',             t:'text',     ph:'https://yourdomain.com/api' },
    { k:'wsSecret',     l:'WebSocket Secret',           t:'password', ph:'your-ws-secret-key' },
    { k:'changelog',    l:'Release Notes (optional)',   t:'text',     ph:'Bug fixes, improved sync speed' },
  ],
  google_auth: [
    { k:'clientId',     l:'Google Client ID',     t:'text',     ph:'123456789-abc...apps.googleusercontent.com' },
    { k:'clientSecret', l:'Google Client Secret', t:'password', ph:'GOCSPX-...' },
  ],
  tawk: [
    { k:'propertyId', l:'Property ID',  t:'text', ph:'64abc123def456789abc1234 (from tawk.to Dashboard → Administration → Property)' },
    { k:'widgetId',   l:'Widget ID',    t:'text', ph:'default (leave as default unless you have multiple widgets)' },
  ],
  ccavenue: [
    { k:'merchantId',  l:'Merchant ID',     t:'text',     ph:'12345' },
    { k:'accessCode',  l:'Access Code',     t:'text',     ph:'AVXX0000XXXXX' },
    { k:'workingKey',  l:'Working Key',     t:'password', ph:'••••••••' },
    { k:'redirectUrl', l:'Redirect URL',    t:'text',     ph:'https://yourserver.com/webhooks/ccavenue' },
    { k:'cancelUrl',   l:'Cancel URL',      t:'text',     ph:'https://yourapp.com/subscription?payment=cancelled' },
    { k:'environment', l:'Environment',     t:'text',     ph:'production' },
  ],
}

const TOTP_OPTS = [
  { k:'enforceForAdmins',  l:'Enforce 2FA for Admins' },
  { k:'enforceForSupport', l:'Enforce 2FA for Support' },
  { k:'enforceForUsers',   l:'Enforce 2FA for Users' },
]

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button onClick={onChange} disabled={disabled} style={{
      position:'relative', width:46, height:26, borderRadius:99, flexShrink:0,
      background: checked ? '#34d399' : '#1a1a2e',
      border:`1px solid ${checked ? '#34d399' : '#282840'}`,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, transition:'background .2s, border-color .2s',
    }}>
      <motion.div animate={{ x: checked ? 21 : 2 }} transition={{ type:'spring', stiffness:500, damping:30 }}
        style={{ position:'absolute', top:2, width:20, height:20, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 5px rgba(0,0,0,.3)' }}/>
    </button>
  )
}

function CheckBox({ checked, onChange, label }) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
      <div onClick={onChange} style={{
        width:18, height:18, borderRadius:5, flexShrink:0,
        background: checked ? '#58a6ff' : 'transparent',
        border:`2px solid ${checked ? '#58a6ff' : '#282840'}`,
        display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s',
      }}>
        {checked && <CheckCircle2 size={11} style={{ color:'#fff' }}/>}
      </div>
      <span style={{ fontSize:'0.9375rem', color:'var(--text-secondary)' }}>{label}</span>
    </label>
  )
}

// ── Image uploader (logo) ─────────────────────────────────────────────────────
function ImageUploader({ value, onUploaded, uploadPath, deletePath, label = 'Logo Image' }) {
  const inputRef = useRef(null)
  const [uploading,    setUploading]    = useState(false)
  const [removing,     setRemoving]     = useState(false)
  const [confirmOpen,  setConfirmOpen]  = useState(false)
  const { toast } = useToast()

  async function handleFile(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('Please select an image file', 'error')
    if (file.size > 5 * 1024 * 1024) return toast('Image must be under 5 MB', 'error')
    setUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const r = await api.post(uploadPath, { image: e.target.result, oldUrl: value })
          onUploaded(r.url)
          toast('Logo uploaded', 'success')
        } catch (err) { toast(err.message, 'error') }
        finally { setUploading(false) }
      }
      reader.onerror = () => { toast('Failed to read file', 'error'); setUploading(false) }
      reader.readAsDataURL(file)
    } catch { setUploading(false) }
  }

  async function confirmRemove() {
    setConfirmOpen(false)
    setRemoving(true)
    try {
      if (deletePath) await api.delete(deletePath)
      onUploaded('')
      toast('Logo removed', 'success')
    } catch (err) { toast(err.message, 'error') }
    finally { setRemoving(false) }
  }

  const busy = uploading || removing

  return (
    <div style={{ gridColumn: '1/-1' }}>
      <label className="field-label">{label}</label>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {/* Preview */}
        <div style={{ width: 56, height: 56, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
          background: 'var(--bg-surface2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {value
            ? <img src={value} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            : <Image size={20} style={{ color: 'var(--text-dim)' }}/>}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* URL text input */}
          <input value={value} onChange={e => onUploaded(e.target.value)}
            placeholder="https://…/logo.png  or upload below"
            className="field-input" style={{ width: '100%' }}/>
          {/* Buttons row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])}/>
            <button disabled={busy}
              onClick={() => inputRef.current?.click()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px',
                borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--bg-surface2)',
                cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', color: 'var(--text-muted)',
                opacity: busy ? 0.6 : 1, transition: 'border-color .15s, color .15s' }}
              onMouseEnter={e => { if (!busy) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
              {uploading
                ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: .8, repeat: Infinity, ease: 'linear' }}
                    style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: 'var(--accent)' }}/> Uploading…</>
                : <><Upload size={13}/> Upload from device</>}
            </button>
            {value && (
              <button disabled={busy} onClick={() => setConfirmOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px',
                  borderRadius: 8, border: '1px solid rgba(248,113,113,.3)', background: 'rgba(248,113,113,.06)',
                  cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', color: '#f87171',
                  opacity: busy ? 0.6 : 1, transition: 'border-color .15s, background .15s' }}
                onMouseEnter={e => { if (!busy) e.currentTarget.style.background = 'rgba(248,113,113,.14)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(248,113,113,.06)' }}>
                {removing
                  ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: .8, repeat: Infinity, ease: 'linear' }}
                      style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(248,113,113,.3)', borderTopColor: '#f87171' }}/> Removing…</>
                  : <><Trash2 size={13}/> Remove logo</>}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirm delete modal */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Remove Logo" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {value && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <img src={value} alt="logo" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border)' }}/>
            </div>
          )}
          <p style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6 }}>
            This will permanently delete the logo from Cloudinary. This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={confirmRemove}
              style={{ background: '#ef4444', boxShadow: '0 4px 14px rgba(239,68,68,.3)' }}>
              <Trash2 size={13}/> Remove
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── File uploader (exe / installer) ──────────────────────────────────────────
function FileUploader({ value, fileSizeMb, onUploaded, uploadPath }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const { toast } = useToast()

  async function handleFile(file) {
    if (!file) return
    if (file.size > 200 * 1024 * 1024) return toast('File must be under 200 MB', 'error')
    setUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const r = await api.post(uploadPath, { file: e.target.result, filename: file.name, oldUrl: value })
          onUploaded({ url: r.url, fileSizeMb: r.fileSizeMb })
          toast('File uploaded to Cloudinary', 'success')
        } catch (err) { toast(err.message, 'error') }
        finally { setUploading(false) }
      }
      reader.onerror = () => { toast('Failed to read file', 'error'); setUploading(false) }
      reader.readAsDataURL(file)
    } catch { setUploading(false) }
  }

  const name = value ? value.split('/').pop().split('?')[0] : null

  return (
    <div style={{ gridColumn: '1/-1' }}>
      <label className="field-label">Download File (.exe / installer)</label>
      {/* Current file */}
      {value && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 9,
          background: 'rgba(88,166,255,.06)', border: '1px solid rgba(88,166,255,.2)', marginBottom: 8 }}>
          <HardDrive size={14} style={{ color: '#58a6ff', flexShrink: 0 }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{name}</p>
            {fileSizeMb && <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>{fileSizeMb}</p>}
          </div>
          <a href={value} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '0.75rem', color: '#58a6ff', textDecoration: 'none', flexShrink: 0 }}>
            ↗ Preview
          </a>
        </div>
      )}
      {/* URL text input */}
      <input value={value} onChange={e => onUploaded({ url: e.target.value })}
        placeholder="https://cdn.yoursite.com/Bridge-Setup.exe  or upload below"
        className="field-input" style={{ width: '100%', marginBottom: 6 }}/>
      {/* Upload button */}
      <input ref={inputRef} type="file" accept=".exe,.msi,.dmg,.apk,.pkg,.zip" style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files[0])}/>
      <button disabled={uploading}
        onClick={() => inputRef.current?.click()}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px',
          borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--bg-surface2)',
          cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', color: 'var(--text-muted)',
          opacity: uploading ? 0.6 : 1, transition: 'border-color .15s, color .15s' }}
        onMouseEnter={e => { if (!uploading) { e.currentTarget.style.borderColor = '#58a6ff'; e.currentTarget.style.color = '#58a6ff' }}}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
        {uploading
          ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: .8, repeat: Infinity, ease: 'linear' }}
              style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#58a6ff' }}/> Uploading…</>
          : <><FileUp size={13}/> Upload installer from device</>}
      </button>
    </div>
  )
}

// ── About Us editor ───────────────────────────────────────────────────────────
function AboutPluginCard({ plugin, onRefresh }) {
  const { toast } = useToast()
  const cfg = plugin?.config || {}

  const [saving, setSaving] = useState(false)
  const [info,   setInfo]   = useState({
    appName:          cfg.appName          || 'Attendix',
    version:          cfg.version          || '1.0.0',
    tagline:          cfg.tagline          || '',
    description:      cfg.description      || '',
    companyName:      cfg.companyName      || '',
    foundedYear:      cfg.foundedYear      || '',
    website:          cfg.website          || '',
    missionStatement: cfg.missionStatement || '',
    contactAddress:   cfg.contactAddress   || '',
    contactPhone:     cfg.contactPhone     || '',
    contactEmail:     cfg.contactEmail     || '',
    linkedin:         cfg.linkedin         || '',
    twitter:          cfg.twitter          || '',
    github:           cfg.github           || '',
    logoUrl:          cfg.logoUrl          || '',
  })
  const [features, setFeatures] = useState(() => {
    try { return JSON.parse(cfg.features || '[]') } catch { return [] }
  })
  const [team, setTeam] = useState(() => {
    try { return JSON.parse(cfg.team || '[]') } catch { return [] }
  })

  function setF(k, v) { setInfo(s => ({ ...s, [k]: v })) }

  function addFeature()      { setFeatures(f => [...f, { icon:'⭐', title:'', desc:'' }]) }
  function removeFeature(i)  { setFeatures(f => f.filter((_,j) => j !== i)) }
  function updateFeature(i,k,v) { setFeatures(f => f.map((x,j) => j===i ? {...x,[k]:v} : x)) }

  function addMember()       { setTeam(t => [...t, { name:'', role:'', bio:'', photo:'' }]) }
  function removeMember(i)   { setTeam(t => t.filter((_,j) => j !== i)) }
  function updateMember(i,k,v) { setTeam(t => t.map((x,j) => j===i ? {...x,[k]:v} : x)) }

  async function save() {
    setSaving(true)
    try {
      await api.patch(`/admin/plugins/about_us/config`, {
        ...info,
        features: JSON.stringify(features),
        team:     JSON.stringify(team),
      })
      toast('About page saved', 'success')
      onRefresh()
    } catch(e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const sectionLabel = (icon, label) => (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, paddingBottom:8, borderBottom:'1px solid var(--border-soft)' }}>
      {icon}
      <span style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</span>
    </div>
  )

  return (
    <motion.div layout style={{ background:'var(--bg-surface)', borderRadius:16, overflow:'hidden',
      border:'1px solid rgba(244,114,182,.25)', boxShadow:'0 4px 20px rgba(0,0,0,.25)' }}>
      {/* Header */}
      <div style={{ padding:'1.25rem 1.5rem', display:'flex', alignItems:'center', gap:14,
        background:'linear-gradient(135deg,rgba(244,114,182,.07),rgba(88,166,255,.04))' }}>
        <div style={{ width:44, height:44, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(244,114,182,.12)', border:'1px solid rgba(244,114,182,.25)', flexShrink:0 }}>
          <Info size={20} style={{ color:'#f472b6' }}/>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
            <span style={{ fontSize:'1rem', fontWeight:700, color:'var(--text-primary)' }}>About Us Page</span>
            <span style={{ fontSize:'0.72rem', padding:'2px 9px', borderRadius:99, background:'rgba(244,114,182,.1)',
              color:'#f472b6', border:'1px solid rgba(244,114,182,.2)', fontWeight:600 }}>Public Page</span>
            {info.version && (
              <span style={{ fontSize:'0.72rem', padding:'2px 9px', borderRadius:99, background:'rgba(88,166,255,.1)',
                color:'#58a6ff', border:'1px solid rgba(88,166,255,.2)', fontFamily:'monospace' }}>v{info.version}</span>
            )}
          </div>
          <p style={{ fontSize:'0.875rem', color:'var(--text-muted)' }}>Configure public About page — app info, company, mission, features, team & contact.</p>
        </div>
      </div>

      <div style={{ padding:'1.5rem', display:'flex', flexDirection:'column', gap:28 }}>

        {/* App Info */}
        <div>
          {sectionLabel(<Plug size={14} style={{color:'#58a6ff'}}/>, 'Application Info')}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Input label="App Name"    value={info.appName}   onChange={e=>setF('appName',e.target.value)}   placeholder="Attendix"/>
            <Input label="Version"     value={info.version}   onChange={e=>setF('version',e.target.value)}   placeholder="1.0.0"  />
            <Input label="Tagline"     value={info.tagline}   onChange={e=>setF('tagline',e.target.value)}   placeholder="Attendance & Payroll Simplified" style={{ gridColumn:'1/-1' }}/>
            <div style={{ gridColumn:'1/-1' }}>
              <label className="field-label">Description</label>
              <textarea value={info.description} onChange={e=>setF('description',e.target.value)}
                rows={3} placeholder="Short paragraph about the application…"
                className="field-input" style={{ resize:'vertical', fontFamily:'inherit', width:'100%' }}/>
            </div>
            <ImageUploader
              value={info.logoUrl}
              onUploaded={url => setF('logoUrl', url)}
              uploadPath="/admin/plugins/about_us/upload-logo"
              deletePath="/admin/plugins/about_us/logo"
            />
          </div>
        </div>

        {/* Company */}
        <div>
          {sectionLabel(<Building2 size={14} style={{color:'#34d399'}}/>, 'Company')}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Input label="Company Name"  value={info.companyName}  onChange={e=>setF('companyName',e.target.value)}  placeholder="Insha Technologies"/>
            <Input label="Founded Year"  value={info.foundedYear}  onChange={e=>setF('foundedYear',e.target.value)}  placeholder="2024"/>
            <Input label="Website"       value={info.website}      onChange={e=>setF('website',e.target.value)}      placeholder="https://inshatech.com" style={{ gridColumn:'1/-1' }}/>
            <div style={{ gridColumn:'1/-1' }}>
              <label className="field-label">Mission Statement</label>
              <textarea value={info.missionStatement} onChange={e=>setF('missionStatement',e.target.value)}
                rows={2} placeholder="Our mission is to…"
                className="field-input" style={{ resize:'vertical', fontFamily:'inherit', width:'100%' }}/>
            </div>
          </div>
        </div>

        {/* Features */}
        <div>
          {sectionLabel(<Star size={14} style={{color:'#fbbf24'}}/>, 'Key Features')}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {features.map((f, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'50px 1fr 2fr auto', gap:8, alignItems:'center',
                padding:'10px 12px', borderRadius:10, background:'var(--bg-surface2)', border:'1px solid var(--border-soft)' }}>
                <Input value={f.icon} onChange={e=>updateFeature(i,'icon',e.target.value)} placeholder="🔒" style={{ textAlign:'center', fontSize:'1.2rem' }}/>
                <Input value={f.title} onChange={e=>updateFeature(i,'title',e.target.value)} placeholder="Feature title"/>
                <Input value={f.desc}  onChange={e=>updateFeature(i,'desc',e.target.value)}  placeholder="Short description"/>
                <button onClick={()=>removeFeature(i)} style={{ width:32, height:32, borderRadius:8, border:'1px solid rgba(248,113,113,.3)',
                  background:'rgba(248,113,113,.08)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Trash2 size={13} style={{color:'#f87171'}}/>
                </button>
              </div>
            ))}
            <button onClick={addFeature} style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 14px', borderRadius:9,
              border:'1px dashed var(--border)', background:'transparent', cursor:'pointer', color:'var(--text-dim)', fontSize:'0.82rem' }}>
              <Plus size={13}/> Add Feature
            </button>
          </div>
        </div>

        {/* Team */}
        <div>
          {sectionLabel(<Users size={14} style={{color:'#c084fc'}}/>, 'Team Members')}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {team.map((m, i) => (
              <div key={i} style={{ padding:'12px 14px', borderRadius:10, background:'var(--bg-surface2)',
                border:'1px solid var(--border-soft)', display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:8 }}>
                  <Input value={m.name}  onChange={e=>updateMember(i,'name',e.target.value)}  placeholder="Full name"/>
                  <Input value={m.role}  onChange={e=>updateMember(i,'role',e.target.value)}  placeholder="Role / Designation"/>
                  <button onClick={()=>removeMember(i)} style={{ width:32, height:32, borderRadius:8, border:'1px solid rgba(248,113,113,.3)',
                    background:'rgba(248,113,113,.08)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', marginTop:22, flexShrink:0 }}>
                    <Trash2 size={13} style={{color:'#f87171'}}/>
                  </button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:8 }}>
                  <Input value={m.bio}   onChange={e=>updateMember(i,'bio',e.target.value)}   placeholder="Short bio"/>
                  <Input value={m.photo} onChange={e=>updateMember(i,'photo',e.target.value)} placeholder="Photo URL"/>
                </div>
              </div>
            ))}
            <button onClick={addMember} style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 14px', borderRadius:9,
              border:'1px dashed var(--border)', background:'transparent', cursor:'pointer', color:'var(--text-dim)', fontSize:'0.82rem' }}>
              <Plus size={13}/> Add Team Member
            </button>
          </div>
        </div>

        {/* Contact */}
        <div>
          {sectionLabel(<Phone size={14} style={{color:'#fb923c'}}/>, 'Contact & Social')}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Input label="Email"   value={info.contactEmail}   onChange={e=>setF('contactEmail',e.target.value)}   placeholder="hello@inshatech.com"/>
            <Input label="Phone"   value={info.contactPhone}   onChange={e=>setF('contactPhone',e.target.value)}   placeholder="+91 99999 99999"/>
            <Input label="Address" value={info.contactAddress} onChange={e=>setF('contactAddress',e.target.value)} placeholder="City, State, Country" style={{ gridColumn:'1/-1' }}/>
            <Input label="LinkedIn URL"  value={info.linkedin} onChange={e=>setF('linkedin',e.target.value)} placeholder="https://linkedin.com/company/…"/>
            <Input label="Twitter/X URL" value={info.twitter}  onChange={e=>setF('twitter',e.target.value)}  placeholder="https://twitter.com/…"/>
            <Input label="GitHub URL"    value={info.github}   onChange={e=>setF('github',e.target.value)}   placeholder="https://github.com/…" style={{ gridColumn:'1/-1' }}/>
          </div>
        </div>

        {/* Save */}
        <div style={{ paddingTop:8, borderTop:'1px solid var(--border-soft)' }}>
          <Button onClick={save} loading={saving}>Save About Page</Button>
        </div>
      </div>
    </motion.div>
  )
}

function PluginCard({ plugin, onRefresh }) {
  const [open,     setOpen]     = useState(false)
  const [form,     setForm]     = useState({})
  const [checks,   setChecks]   = useState({})
  const [toggling, setToggling] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [testing,  setTesting]  = useState(false)
  const [testData,  setTestData] = useState(null)
  const { toast } = useToast()
  const meta = META[plugin.name] || {}
  const Icon = meta.icon || Plug
  const accent = meta.color || '#58a6ff'

  useEffect(() => {
    const cfg = plugin.config || {}
    const f = {}
    for (const field of FIELDS[plugin.name] || []) {
      f[field.k] = (field.t === 'password' && cfg[field.k]) ? '••••••••' : (cfg[field.k] ?? '')
    }
    setForm(f)
    setChecks({ enforceForAdmins: cfg.enforceForAdmins||false, enforceForSupport: cfg.enforceForSupport||false, enforceForUsers: cfg.enforceForUsers||false })
  }, [plugin])

  async function toggle() {
    setToggling(true)
    try { await api.patch(`/admin/plugins/${plugin.name}/toggle`, { enabled: !plugin.enabled }); toast(`${meta.label} ${plugin.enabled ? 'disabled' : 'enabled'}`, 'success'); onRefresh() }
    catch(e) { toast(e.message, 'error') }
    finally { setToggling(false) }
  }

  async function save() {
    setSaving(true)
    try { await api.patch(`/admin/plugins/${plugin.name}/config`, { ...form, ...checks }); toast('Configuration saved', 'success'); onRefresh() }
    catch(e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function test() {
    setTesting(true); setTestData(null)
    try {
      const target = plugin.testTarget || 'none'
      let body = {}
      if (target === 'mobile') { const v = prompt(`Test ${meta.label}\nEnter mobile number:`); if (!v) { setTesting(false); return }; body = { mobile: v } }
      else if (target === 'email') { const v = prompt(`Test ${meta.label}\nEnter email:`); if (!v) { setTesting(false); return }; body = { email: v } }
      const r = await api.post(`/admin/plugins/${plugin.name}/test`, body)
      toast(r.message || `${meta.label} test passed ✓`, 'success')
      // Store extra test data (e.g. PhonePe paymentUrl)
      if (r.paymentUrl || r.note) setTestData({ paymentUrl: r.paymentUrl, note: r.note, message: r.message })
      onRefresh()
    } catch(e) { toast(e.message, 'error') }
    finally { setTesting(false) }
  }

  return (
    <motion.div layout style={{
      background:'var(--bg-surface)', borderRadius:16, overflow:'hidden',
      border:`1px solid ${plugin.enabled ? accent+'30' : 'rgba(255,255,255,.06)'}`,
      boxShadow:'0 4px 20px rgba(0,0,0,.25)',
    }}>
      {/* Card header */}
      <div style={{ padding:'1.25rem 1.5rem', display:'flex', alignItems:'center', gap:14 }}>
        {/* Icon */}
        <div style={{ width:44, height:44, borderRadius:12, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:`${accent}15`, border:`1px solid ${accent}30` }}>
          {plugin.name === 'google_auth'
            ? <svg width="22" height="22" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            : <Icon size={20} style={{ color: accent }}/>}
        </div>
        {/* Info */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:3 }}>
            <span style={{ fontSize:'1rem', fontWeight:700, color:'var(--text-primary)' }}>{meta.label}</span>
            {plugin.enabled
              ? <span style={{ fontSize:'0.78rem', padding:'2px 9px', borderRadius:99, background:'rgba(52,211,153,.1)', color:'#34d399', border:'1px solid rgba(52,211,153,.2)', fontWeight:600 }}>Active</span>
              : <span style={{ fontSize:'0.78rem', padding:'2px 9px', borderRadius:99, background:'var(--bg-surface2)', color:'var(--text-muted)', border:'1px solid rgba(255,255,255,.08)' }}>Disabled</span>}
            {plugin.lastTestResult === 'ok' && <span style={{ fontSize:'0.78rem', padding:'2px 9px', borderRadius:99, background:'rgba(163,230,53,.1)', color:'#a3e635', border:'1px solid rgba(163,230,53,.2)', fontWeight:600 }}>✓ Tested</span>}
            {plugin.lastTestResult && plugin.lastTestResult !== 'ok' && <span style={{ fontSize:'0.78rem', padding:'2px 9px', borderRadius:99, background:'rgba(248,113,113,.1)', color:'#f87171', border:'1px solid rgba(248,113,113,.2)' }}>✗ Failed</span>}
          </div>
          <p style={{ fontSize:'0.875rem', color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{meta.desc}</p>
          {plugin.name === 'bridge_app' && plugin.config?.downloadCount > 0 && (
            <span style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--accent)', background:'var(--accent-muted)', padding:'2px 9px', borderRadius:99, border:'1px solid var(--accent-border)', marginTop:4, display:'inline-block' }}>
              ⬇ {plugin.config.downloadCount.toLocaleString()} downloads
            </span>
          )}
        </div>
        {/* Controls */}
        <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <ToggleSwitch checked={plugin.enabled} onChange={toggle} disabled={toggling}/>
          <button onClick={() => setOpen(v=>!v)} className="btn-icon" style={{ color: open ? '#58a6ff' : '' }}>
            {open ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
          </button>
        </div>
      </div>

      {/* Expanded config */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }} style={{ overflow:'hidden' }}>
            <div style={{ padding:'1.5rem', borderTop:`1px solid rgba(255,255,255,.06)`, display:'flex', flexDirection:'column', gap:20 }}>

              {/* Bridge App: file uploader for downloadUrl */}
              {plugin.name === 'bridge_app' && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <FileUploader
                    value={form.downloadUrl || ''}
                    fileSizeMb={form.fileSizeMb || ''}
                    uploadPath="/admin/plugins/bridge_app/upload-file"
                    onUploaded={({ url, fileSizeMb }) => setForm(s => ({
                      ...s,
                      ...(url !== undefined ? { downloadUrl: url } : {}),
                      ...(fileSizeMb ? { fileSizeMb } : {}),
                    }))}
                  />
                </div>
              )}

              {/* Fields (skip downloadUrl for bridge_app — handled above) */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {(FIELDS[plugin.name] || []).filter(f => !(plugin.name === 'bridge_app' && f.k === 'downloadUrl')).map(f => (
                  <Input key={f.k} label={f.l} type={f.t} value={form[f.k]||''} onChange={e => setForm(s => ({...s,[f.k]:e.target.value}))} placeholder={f.ph}/>
                ))}
              </div>

              {/* Bridge App setup guide */}
              {plugin.name === 'bridge_app' && (
                <div style={{ padding:'14px 16px', borderRadius:10, background:'var(--bg-surface2)', border:'1px solid var(--border)' }}>
                  <p style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-primary)', marginBottom:8 }}>How it works</p>
                  <ol style={{ paddingLeft:18, margin:0, display:'flex', flexDirection:'column', gap:4 }}>
                    <li style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>Upload your Bridge .exe directly from your device — Cloudinary hosts it on CDN</li>
                    <li style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>Or paste a direct download URL manually if you prefer another host</li>
                    <li style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>Fill in server connection details, enable the plugin — users see a Download button on Bridge Setup</li>
                    <li style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>Every download is counted and shown here as analytics</li>
                  </ol>
                </div>
              )}
              {/* Google Sign-In setup guide */}
              {plugin.name === 'google_auth' && (
                <div style={{ marginTop:16, padding:'14px 16px', borderRadius:10, background:'var(--bg-surface2)', border:'1px solid var(--border)' }}>
                  <p style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-primary)', marginBottom:8 }}>Setup Guide</p>
                  <ol style={{ paddingLeft:18, margin:0, display:'flex', flexDirection:'column', gap:4 }}>
                    <li style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener" style={{color:'#4285f4'}}>console.cloud.google.com</a></li>
                    <li style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>Create a project → APIs & Services → Credentials</li>
                    <li style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>Create OAuth 2.0 Client ID → Web application</li>
                    <li style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>Add your domain to Authorized JavaScript origins</li>
                    <li style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>Copy Client ID and Client Secret above, then enable</li>
                  </ol>
                </div>
              )}
              {/* Tawk.to setup guide */}
              {plugin.name === 'tawk' && (
                <div style={{ padding:'12px 16px', borderRadius:12, background:'rgba(3,168,78,.07)', border:'1px solid rgba(3,168,78,.2)', display:'flex', flexDirection:'column', gap:6 }}>
                  <p style={{ fontSize:'0.875rem', fontWeight:700, color:'#03a84e' }}>📋 How to get your Property ID</p>
                  <ol style={{ margin:0, paddingLeft:18, display:'flex', flexDirection:'column', gap:4 }}>
                    <li style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>Go to <a href="https://tawk.to" target="_blank" rel="noopener" style={{color:'#03a84e'}}>tawk.to</a> → sign up free</li>
                    <li style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>Administration → Channels → Chat Widget</li>
                    <li style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>Copy the script — Property ID is the long hex after <code style={{color:'#facc15'}}>tawk.to/</code></li>
                    <li style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>Widget ID is after the next <code style={{color:'#facc15'}}>/</code> (usually <code style={{color:'#facc15'}}>default</code>)</li>
                  </ol>
                  <p style={{ fontSize:'0.78rem', color:'#3a5a3a', marginTop:4 }}>Once saved and enabled, the chat widget appears automatically on all user pages.</p>
                </div>
              )}
              {/* TOTP checkboxes */}
              {plugin.name === 'totp_2fa' && (
                <div style={{ display:'flex', flexDirection:'column', gap:10, paddingTop:16, borderTop:'1px solid var(--border-soft)' }}>
                  <p className="field-label">Enforcement</p>
                  {TOTP_OPTS.map(o => (
                    <CheckBox key={o.k} checked={checks[o.k]} onChange={() => setChecks(s=>({...s,[o.k]:!s[o.k]}))} label={o.l}/>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div style={{ display:'flex', flexWrap:'wrap', gap:10, paddingTop:16, borderTop:'1px solid var(--border-soft)', alignItems:'center' }}>
                <Button size="sm" onClick={save} loading={saving}>Save Config</Button>
                <Button size="sm" variant="secondary" onClick={test} loading={testing}><TestTube size={14}/> Test</Button>
                {plugin.lastTestedAt && (
                  <span style={{
                    fontSize:'0.8125rem', fontFamily:'monospace', padding:'4px 10px', borderRadius:8,
                    background: plugin.lastTestResult === 'ok' ? 'rgba(52,211,153,.08)' : 'rgba(248,113,113,.08)',
                    color: plugin.lastTestResult === 'ok' ? '#34d399' : '#f87171',
                    border: `1px solid ${plugin.lastTestResult === 'ok' ? 'rgba(52,211,153,.2)' : 'rgba(248,113,113,.2)'}`,
                  }}>
                    {plugin.lastTestResult === 'ok' ? '✓' : '✗'} Last tested {new Date(plugin.lastTestedAt).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                  </span>
                )}
              </div>

              {/* PhonePe / gateway sandbox test result */}
              {testData && (
                <div style={{ marginTop:12, padding:'14px 16px', borderRadius:12, background:'rgba(95,37,159,0.08)', border:'1px solid rgba(95,37,159,0.25)' }}>
                  <p style={{ fontSize:'0.875rem', fontWeight:600, color:'#c084fc', marginBottom:8 }}>
                    🧪 Sandbox Test Result
                  </p>
                  {testData.message && <p style={{ fontSize:'0.875rem', color:'#a0a0c8', marginBottom:8 }}>{testData.message}</p>}
                  {testData.note && (
                    <div style={{ fontSize:'0.8125rem', padding:'10px 14px', borderRadius:9, background:'rgba(250,204,21,.05)', border:'1px solid rgba(250,204,21,.2)', marginBottom:10 }}>
                      <span style={{ color:'#facc15', fontWeight:600 }}>ℹ️ Note: </span>
                      <span style={{ color:'#8888a8' }}>{testData.note}</span>
                    </div>
                  )}
                  {testData.paymentUrl && (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      <p style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-muted)' }}>Test Payment URL:</p>
                      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                        <code style={{ fontSize:'0.78rem', color:'#7878b8', background:'var(--bg-input)', padding:'6px 10px', borderRadius:8, wordBreak:'break-all', flex:1, border:'1px solid var(--border)' }}>
                          {testData.paymentUrl}
                        </code>
                        <a href={testData.paymentUrl} target="_blank" rel="noopener noreferrer"
                          style={{ padding:'8px 16px', borderRadius:9, background:'rgba(95,37,159,0.2)', border:'1px solid rgba(95,37,159,0.4)', color:'#c084fc', fontSize:'0.875rem', fontWeight:700, textDecoration:'none', whiteSpace:'nowrap', flexShrink:0 }}>
                          Open & Pay →
                        </a>
                      </div>
                      <div style={{ padding:'10px 14px', borderRadius:9, background:'rgba(88,166,255,.06)', border:'1px solid rgba(88,166,255,.15)', marginTop:4 }}>
                        <p style={{ fontSize:'0.8125rem', fontWeight:600, color:'#58a6ff', marginBottom:5 }}>PhonePe Sandbox Test Credentials:</p>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 20px', fontSize:'0.8125rem', fontFamily:'monospace', color:'#7878a8' }}>
                          <span>UPI (success): <strong style={{ color:'#34d399' }}>success@ybl</strong></span>
                          <span>UPI (failure): <strong style={{ color:'#f87171' }}>failure@ybl</strong></span>
                          <span>UPI (pending): <strong style={{ color:'#facc15' }}>pending@ybl</strong></span>
                          <span>Card: <strong style={{ color:'#c084fc' }}>4111 1111 1111 1111</strong></span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function AdminPlugins() {
  const { ready } = useAuth()
  const { toast } = useToast()
  const [plugins, setPlugins] = useState([])
  const [loading, setLoad]    = useState(true)
  const [q,       setQ]       = useState('')

  async function load() {
    setLoad(true)
    try { const r = await api.get('/admin/plugins'); setPlugins(r.data || []) }
    catch(e) { toast(e.message, 'error') }
    finally { setLoad(false) }
  }

  useEffect(() => { if (ready) load() }, [ready])

  const PAYMENT_GWS  = ['razorpay','phonepe','paytm','ccavenue']
  const BRIDGE_GWS   = ['bridge_app']
  const AUTH_GWS     = ['google_auth']
  const CHAT_GWS     = ['tawk']
  const ABOUT_GWS    = ['about_us']
  const enabled      = plugins.filter(p => p.enabled).length
  const tested       = plugins.filter(p => p.lastTestResult === 'ok').length
  const activeGW     = plugins.filter(p => PAYMENT_GWS.includes(p.name) && p.enabled).length
  const aboutPlugin  = plugins.find(p => p.name === 'about_us')
  const integrations = plugins.filter(p => !PAYMENT_GWS.includes(p.name) && !CHAT_GWS.includes(p.name) && !AUTH_GWS.includes(p.name) && !BRIDGE_GWS.includes(p.name) && !ABOUT_GWS.includes(p.name))
  const gateways     = plugins.filter(p => PAYMENT_GWS.includes(p.name))
  const authPlugins  = plugins.filter(p => AUTH_GWS.includes(p.name))
  const bridgePlugins = plugins.filter(p => BRIDGE_GWS.includes(p.name))
  const chatPlugins  = plugins.filter(p => CHAT_GWS.includes(p.name))

  return (
    <AdminPage>
      <PageHeader title="Plugins & Integrations" icon={Plug} iconColor="#fb923c"
        subtitle={`${enabled} enabled · ${tested} tested OK · ${plugins.length} total`}>
        <Button variant="secondary" onClick={load}><RefreshCw size={14}/></Button>
      </PageHeader>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:12 }}>
        {[
          { label:'Total',      value:plugins.length,                                     accent:'#58a6ff', icon:Plug          },
          { label:'Enabled',    value:enabled,                                            accent:'#34d399', icon:CheckCircle2  },
          { label:'Disabled',   value:plugins.length - enabled,                           accent:'#5a5a7a', icon:XCircle       },
          { label:'Tested OK',  value:tested,                                             accent:'#a3e635', icon:CheckCircle2  },
          { label:'Test Failed',value:plugins.filter(p=>p.lastTestResult&&p.lastTestResult!=='ok').length, accent:'#f87171', icon:AlertTriangle },
          { label:'Not Tested', value:plugins.filter(p=>!p.lastTestResult).length,       accent:'#fb923c', icon:AlertTriangle  },
        ].map((s,i) => <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} accent={s.accent} index={i}/>)}
      </div>

      <SearchBox value={q} onChange={e=>setQ(e.target.value)} placeholder="Search plugins…"/>

      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>{[1,2,3,4].map(i=><div key={i} style={{ height:80, borderRadius:16 }} className="shimmer"/>)}</div>
      ) : (<>
        {/* Integrations */}
        <div>
          <p style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Integrations</p>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {integrations.filter(p => !q || META[p.name]?.label?.toLowerCase().includes(q.toLowerCase()) || p.name.includes(q.toLowerCase())).map(p => <PluginCard key={p.name} plugin={p} onRefresh={load}/>)}
          </div>
        </div>
        {/* Bridge App */}
        {bridgePlugins.length > 0 && (
          <div>
            <p style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Bridge Desktop App</p>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {bridgePlugins.map(p => <PluginCard key={p.name} plugin={p} onRefresh={load}/>)}
            </div>
          </div>
        )}
        {/* Social & Auth Login */}
        {authPlugins.length > 0 && (
          <div>
            <p style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Social &amp; Auth Login</p>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {authPlugins.map(p => <PluginCard key={p.name} plugin={p} onRefresh={load}/>)}
            </div>
          </div>
        )}
        {/* Live Chat */}
        <div>
          <p style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Live Chat</p>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {chatPlugins.map(p => <PluginCard key={p.name} plugin={p} onRefresh={load}/>)}
          </div>
        </div>
        {/* About Us Page */}
        {aboutPlugin && (
          <div>
            <p style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>About Us Page</p>
            <AboutPluginCard plugin={aboutPlugin} onRefresh={load}/>
          </div>
        )}
        {/* Payment Gateways */}
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <p style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Payment Gateways</p>
            {activeGW > 0
              ? <span style={{ fontSize:'0.8125rem', padding:'3px 10px', borderRadius:99, background:'rgba(52,211,153,.1)', color:'#34d399', border:'1px solid rgba(52,211,153,.2)', fontWeight:600 }}>✓ {activeGW} active — auto-collecting payments</span>
              : <span style={{ fontSize:'0.8125rem', padding:'3px 10px', borderRadius:99, background:'rgba(251,146,60,.08)', color:'#fb923c', border:'1px solid rgba(251,146,60,.2)', fontWeight:500 }}>No gateway enabled — users pay manually</span>}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {gateways.filter(p => !q || META[p.name]?.label?.toLowerCase().includes(q.toLowerCase()) || p.name.includes(q.toLowerCase())).map(p => <PluginCard key={p.name} plugin={p} onRefresh={load}/>)}
          </div>
        </div>
      </>)}
    </AdminPage>
  )
}