import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download, Wifi, Copy, CheckCircle2, Monitor, Key, Globe,
  RefreshCw, ChevronDown, ChevronUp, AlertTriangle, BookOpen,
  Zap, Shield, ExternalLink, Package, Tag, HardDrive
} from 'lucide-react'
import { UserPage, UserPageHeader } from '../components/ui/UserUI'
import { useAuth } from '../store/auth'
import { useToast } from '../components/ui/Toast'
import api from '../lib/api'

/* ── Copy field ── */
function CopyField({ label, value, secret=false, hint }) {
  const [copied, setCopied] = useState(false)
  const [show,   setShow]   = useState(!secret)
  const { toast } = useToast()

  function copy() {
    if (!value) return
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
      toast(`${label} copied!`, 'success')
    })
  }

  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:'block', fontSize:'0.75rem', fontWeight:700,
        color:'var(--text-muted)', textTransform:'uppercase',
        letterSpacing:'0.08em', marginBottom:7 }}>{label}</label>
      <div style={{ display:'flex', border:'1.5px solid var(--border)', borderRadius:11,
        background:'var(--bg-input)', overflow:'hidden', transition:'border-color .2s' }}
        onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border-bright)'}
        onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
        <span style={{ flex:1, padding:'12px 14px', fontSize:'0.875rem',
          fontFamily:'monospace', color:value?'var(--text-primary)':'var(--text-dim)',
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', userSelect:'all' }}>
          {value ? (secret && !show ? '•'.repeat(Math.min(value.length,28)) : value) : '— not configured —'}
        </span>
        {secret && value && (
          <button onClick={()=>setShow(s=>!s)}
            style={{ padding:'0 12px', background:'none', border:'none',
              borderLeft:'1px solid var(--border)', cursor:'pointer',
              color:'var(--text-muted)', display:'flex', alignItems:'center' }}>
            {show ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
          </button>
        )}
        <button onClick={copy} disabled={!value}
          style={{ padding:'0 16px', background:copied?'rgba(52,211,153,.1)':'transparent',
            border:'none', borderLeft:'1px solid var(--border)',
            cursor:value?'pointer':'not-allowed',
            color:copied?'#16a34a':'var(--text-muted)',
            display:'flex', alignItems:'center', gap:5, fontSize:'0.8rem',
            fontWeight:600, transition:'all .2s', whiteSpace:'nowrap', minWidth:80 }}>
          {copied ? <><CheckCircle2 size={13}/> Copied</> : <><Copy size={13}/> Copy</>}
        </button>
      </div>
      {hint && <p style={{ fontSize:'0.75rem', color:'var(--text-dim)', marginTop:4 }}>{hint}</p>}
    </div>
  )
}

/* ── Accordion step ── */
function Step({ n, title, done, defaultOpen=false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border:`1px solid ${done?'rgba(52,211,153,.25)':'var(--border)'}`,
      borderRadius:14, overflow:'hidden',
      background:done?'rgba(52,211,153,.02)':'var(--bg-surface)',
      boxShadow:'var(--shadow-card)' }}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{ width:'100%', padding:'17px 20px', display:'flex', alignItems:'center',
          gap:14, background:'none', border:'none', cursor:'pointer', textAlign:'left' }}>
        <div style={{ width:33, height:33, borderRadius:'50%', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontWeight:800, fontSize:'0.875rem',
          background:done?'rgba(52,211,153,.15)':'var(--accent-muted)',
          border:`1.5px solid ${done?'rgba(52,211,153,.4)':'var(--accent-border)'}`,
          color:done?'#16a34a':'var(--accent)' }}>
          {done ? <CheckCircle2 size={15}/> : n}
        </div>
        <span style={{ flex:1, fontWeight:700, fontSize:'0.9375rem', color:'var(--text-primary)' }}>{title}</span>
        {done && <span style={{ fontSize:'0.75rem', padding:'2px 9px', borderRadius:99,
          background:'rgba(52,211,153,.1)', color:'#16a34a',
          border:'1px solid rgba(52,211,153,.2)', fontWeight:600, marginRight:6 }}>Done</span>}
        {open ? <ChevronUp size={16} style={{ color:'var(--text-dim)', flexShrink:0 }}/>
               : <ChevronDown size={16} style={{ color:'var(--text-dim)', flexShrink:0 }}/>}
      </button>
      {open && (
        <div style={{ padding:'4px 20px 22px', borderTop:'1px solid var(--border-soft)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

/* ── Main ── */
export default function BridgeSetup() {
  const { user, ready } = useAuth()
  const { toast } = useToast()
  const isAdmin   = ['admin','support'].includes(user?.role)

  const [orgs,     setOrgsLocal] = useState(null)   // null=loading, []=empty, [...]= loaded
  const [selOrgId, setSelOrgId]  = useState(null)
  const [org,      setOrg]       = useState(null)
  const [config,   setConfig]    = useState(null)
  const [loading,  setLoading]   = useState(true)
  const [creating, setCreating]  = useState(false)
  const [dlBusy,   setDlBusy]    = useState(false)

  // Fetch orgs directly — don't depend on OrgContextBar timing
  useEffect(() => {
    if (!ready) return
    api.get('/organizations').then(r => {
      const data = r.data || []
      setOrgsLocal(data)
      if (data.length > 0) setSelOrgId(data[0].orgId)
    }).catch(() => setOrgsLocal([]))
  }, [ready])

  // Load org detail + config when org selected
  useEffect(() => {
    if (!selOrgId) return
    load(selOrgId)
  }, [selOrgId])

  // Also update loading=false when orgs loaded but empty
  useEffect(() => {
    if (orgs !== null && orgs.length === 0) setLoading(false)
  }, [orgs])

  const orgId = selOrgId

  async function load(oid) {
    setLoading(true)
    try {
      const id = oid || orgId
      const [orgR, cfgR] = await Promise.allSettled([
        api.get(`/organizations/${id}`),
        api.get(`/organizations/${id}/bridge-config`),
      ])
      if (orgR.status === 'fulfilled') setOrg(orgR.value.data || orgR.value)
      if (cfgR.status === 'fulfilled') setConfig(cfgR.value.data || cfgR.value)
    } catch(e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  async function createBridge() {
    setCreating(true)
    try {
      await api.post(`/organizations/${orgId}/bridge/create`, { name:`${org?.name} Bridge` })
      toast('Bridge created!', 'success'); load(selOrgId)
    } catch(e) { toast(e.message, 'error') }
    finally { setCreating(false) }
  }

  async function handleDownload() {
    setDlBusy(true)
    try {
      const r = await api.post('/bridge-app/download')
      if (r.downloadUrl) {
        const a = document.createElement('a')
        a.href = r.downloadUrl; a.download = ''; a.target = '_blank'
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        toast(`Downloading Bridge v${r.version||''}…`, 'success')
      }
    } catch(e) { toast(e.message, 'error') }
    finally { setDlBusy(false) }
  }

  const hasBridge    = !!(org?.bridgeId)
  const hasDownload  = !!(config?.downloadUrl)
  const bridgeId     = org?.bridgeId    || ''
  const wsUrl        = config?.wsUrl    || ''
  const apiUrl       = config?.apiUrl   || ''
  const wsSecret     = config?.wsSecret || ''
  const version      = config?.version  || ''
  const fileSizeMb   = config?.fileSizeMb || ''
  const changelog    = config?.changelog || ''
  const dlCount      = config?.downloadCount || 0

  return (
    <UserPage>
      <UserPageHeader title="Bridge Setup" icon={Wifi} iconColor="var(--accent)"
        subtitle="Connect your biometric machines to the cloud via the desktop Bridge app">
        <button onClick={load}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 14px', borderRadius:10,
            background:'var(--bg-surface)', border:'1px solid var(--border)', cursor:'pointer',
            color:'var(--text-muted)', fontSize:'0.875rem', fontWeight:600, transition:'all .15s' }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-muted)'}}>
          <RefreshCw size={13}/> Refresh
        </button>
      </UserPageHeader>

      {/* Org selector when multiple orgs */}
      {orgs && orgs.length > 1 && orgId && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
          background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:12,
          boxShadow:'var(--shadow-card)' }}>
          <span style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-muted)',
            textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap' }}>Organization</span>
          <select value={selOrgId||''} onChange={e=>setSelOrgId(e.target.value)}
            style={{ flex:1, padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)',
              background:'var(--bg-input)', color:'var(--text-primary)', fontSize:'0.9375rem',
              fontWeight:600, outline:'none', cursor:'pointer' }}>
            {orgs.map(o => <option key={o.orgId} value={o.orgId}>{o.name}</option>)}
          </select>
        </div>
      )}

      {orgs !== null && !orgId && !loading && (
        <div style={{ padding:'2rem', textAlign:'center', background:'var(--bg-surface)',
          border:'1px solid var(--border)', borderRadius:16 }}>
          <p style={{ color:'var(--text-muted)', fontSize:'0.9375rem' }}>
            No organizations found. <a href="/organizations" style={{ color:'var(--accent)', fontWeight:700 }}>Create one first →</a>
          </p>
        </div>
      )}

      {loading && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {[1,2,3,4].map(i=><div key={i} style={{ height:66, borderRadius:14 }} className="shimmer"/>)}
        </div>
      )}

      {!loading && orgId && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:'1.5rem', alignItems:'start' }}>

          {/* ── Left: Steps ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

            {/* Step 1: Download */}
            <Step n={1} title="Download the Bridge app" done={false} defaultOpen={true}>
              <div style={{ paddingTop:16 }}>
                {!hasDownload ? (
                  <div style={{ padding:'18px', borderRadius:12, background:'rgba(251,146,60,.06)',
                    border:'1px solid rgba(251,146,60,.2)', display:'flex', alignItems:'flex-start', gap:12 }}>
                    <AlertTriangle size={16} style={{ color:'#d97706', flexShrink:0, marginTop:1 }}/>
                    <div>
                      <p style={{ fontWeight:700, fontSize:'0.875rem', color:'var(--text-primary)', marginBottom:4 }}>
                        Download not configured
                      </p>
                      <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)', lineHeight:1.6 }}>
                        {isAdmin
                          ? 'Go to Admin → Plugins → Bridge App Settings to add the download link.'
                          : 'Contact your administrator to set up the Bridge app download.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* App info card */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:18 }}>
                      {[
                        { icon:Package,   label:'Version',   value: version     || '—' },
                        { icon:HardDrive, label:'File size', value: fileSizeMb  || '—' },
                        { icon:Monitor,   label:'Platform',  value: 'Windows 10/11' },
                      ].map(i => (
                        <div key={i.label} style={{ padding:'12px 14px', borderRadius:11,
                          background:'var(--bg-surface2)', border:'1px solid var(--border)',
                          display:'flex', alignItems:'center', gap:10 }}>
                          <i.icon size={15} style={{ color:'var(--accent)', flexShrink:0 }}/>
                          <div>
                            <p style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontWeight:600,
                              textTransform:'uppercase', letterSpacing:'0.06em' }}>{i.label}</p>
                            <p style={{ fontSize:'0.875rem', fontWeight:700, color:'var(--text-primary)', marginTop:2 }}>{i.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Download button */}
                    <motion.button onClick={handleDownload} disabled={dlBusy}
                      whileHover={{ scale:1.015 }} whileTap={{ scale:.975 }}
                      style={{ width:'100%', padding:'15px 20px', borderRadius:13, border:'none',
                        fontWeight:800, fontSize:'1rem', cursor:dlBusy?'not-allowed':'pointer',
                        background:'var(--accent)', color:'#fff',
                        boxShadow:'0 6px 20px var(--accent-muted)',
                        display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                        opacity:dlBusy?.7:1, marginBottom:14, transition:'opacity .2s' }}>
                      {dlBusy
                        ? <><motion.div animate={{rotate:360}} transition={{duration:.8,repeat:Infinity,ease:'linear'}}
                            style={{width:18,height:18,borderRadius:'50%',border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff'}}/> Preparing…</>
                        : <><Download size={18}/> Download Bridge App {version ? `v${version}` : ''} {fileSizeMb ? `· ${fileSizeMb}` : ''}</>}
                    </motion.button>

                    {changelog && (
                      <div style={{ padding:'10px 14px', borderRadius:9, background:'var(--bg-surface2)',
                        border:'1px solid var(--border)', fontSize:'0.8rem', color:'var(--text-muted)' }}>
                        <strong style={{ color:'var(--text-primary)' }}>What's new: </strong>{changelog}
                      </div>
                    )}

                    {/* SmartScreen notice */}
                    <div style={{ marginTop:12, padding:'11px 14px', borderRadius:9,
                      background:'var(--bg-surface2)', border:'1px solid var(--border)',
                      display:'flex', alignItems:'flex-start', gap:8 }}>
                      <AlertTriangle size={13} style={{ color:'#d97706', flexShrink:0, marginTop:2 }}/>
                      <p style={{ fontSize:'0.7875rem', color:'var(--text-muted)', lineHeight:1.6 }}>
                        <strong style={{ color:'var(--text-secondary)' }}>Windows SmartScreen:</strong> If a warning appears, 
                        click <strong style={{ color:'var(--text-primary)' }}>More info → Run anyway</strong>. 
                        Run as Administrator on first launch.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </Step>

            {/* Step 2: Create bridge */}
            <Step n={2} title="Create a Bridge for your Organization" done={hasBridge}>
              <div style={{ paddingTop:16 }}>
                {hasBridge ? (
                  <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px',
                    borderRadius:12, background:'rgba(52,211,153,.06)', border:'1px solid rgba(52,211,153,.2)' }}>
                    <CheckCircle2 size={18} style={{ color:'#16a34a', flexShrink:0 }}/>
                    <div>
                      <p style={{ fontWeight:700, fontSize:'0.875rem', color:'var(--text-primary)' }}>Bridge already created</p>
                      <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginTop:2, fontFamily:'monospace' }}>{bridgeId}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize:'0.9rem', color:'var(--text-muted)', lineHeight:1.7, marginBottom:16 }}>
                      Each organization needs a unique Bridge ID. Create one to get your connection credentials.
                    </p>
                    <motion.button onClick={createBridge} disabled={creating}
                      whileHover={{ scale:1.015 }} whileTap={{ scale:.975 }}
                      style={{ padding:'12px 22px', borderRadius:11, border:'none',
                        fontWeight:800, fontSize:'0.9375rem',
                        background:'var(--accent)', color:'#fff',
                        boxShadow:'0 6px 20px var(--accent-muted)',
                        cursor:creating?'not-allowed':'pointer',
                        display:'flex', alignItems:'center', gap:8, opacity:creating?.7:1 }}>
                      {creating
                        ? <><motion.div animate={{rotate:360}} transition={{duration:.8,repeat:Infinity,ease:'linear'}}
                            style={{width:16,height:16,borderRadius:'50%',border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff'}}/> Creating…</>
                        : <><Zap size={16}/> Create Bridge</>}
                    </motion.button>
                  </>
                )}
              </div>
            </Step>

            {/* Step 3: Configure */}
            <Step n={3} title="Enter these credentials in the Bridge app" done={false}>
              <div style={{ paddingTop:16 }}>
                {!hasBridge && (
                  <div style={{ padding:'11px 14px', borderRadius:9, marginBottom:16,
                    background:'rgba(251,146,60,.06)', border:'1px solid rgba(251,146,60,.2)',
                    display:'flex', alignItems:'center', gap:8 }}>
                    <AlertTriangle size={13} style={{ color:'#d97706' }}/>
                    <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)' }}>Complete Step 2 first to get your Bridge ID</p>
                  </div>
                )}
                <CopyField label="Bridge ID"           value={bridgeId}  hint="Unique identifier for this organization's bridge"/>
                <CopyField label="WebSocket Server URL" value={wsUrl}     hint="The server your Bridge app connects to"/>
                <CopyField label="Server API URL"       value={apiUrl}    hint="REST API endpoint for sync"/>
                <CopyField label="WebSocket Secret"     value={wsSecret}  secret hint="Keep this private — authenticates your bridge"/>
                <div style={{ marginTop:6, padding:'12px 14px', borderRadius:9,
                  background:'var(--bg-surface2)', border:'1px solid var(--border)' }}>
                  <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)', lineHeight:1.65 }}>
                    Open the Bridge app → <strong style={{ color:'var(--text-primary)' }}>Configure</strong> → 
                    paste all 4 values → click <strong style={{ color:'var(--text-primary)' }}>Connect</strong>. 
                    The status indicator turns green when connected.
                  </p>
                </div>
              </div>
            </Step>

            {/* Step 4: Add machines */}
            <Step n={4} title="Add biometric machines in Organizations">
              <div style={{ paddingTop:16 }}>
                <p style={{ fontSize:'0.9rem', color:'var(--text-muted)', lineHeight:1.7, marginBottom:16 }}>
                  Once the Bridge is online, go to your Organization → 
                  <strong style={{ color:'var(--text-primary)' }}> Machines → Add Machine</strong> and 
                  enter your device's IP address, port, and model.
                </p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    { label:'Supported brands',  value:'ZKTeco, eSSL, Realtime, BioMax, Hikvision, Matrix' },
                    { label:'Connection',         value:'TCP/IP — device must be on same LAN as Bridge PC'   },
                    { label:'Default port',       value:'4370 (ZKTeco / eSSL) — check your device manual'   },
                    { label:'Sync interval',      value:'Real-time push when online, catch-up on reconnect'  },
                  ].map(i => (
                    <div key={i.label} style={{ padding:'12px 14px', borderRadius:10,
                      background:'var(--bg-surface2)', border:'1px solid var(--border)' }}>
                      <p style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--text-muted)',
                        textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>{i.label}</p>
                      <p style={{ fontSize:'0.8rem', color:'var(--text-primary)', lineHeight:1.5 }}>{i.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Step>
          </div>

          {/* ── Right: Sidebar ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:12, position:'sticky', top:24 }}>

            {/* Bridge status */}
            <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)',
              borderRadius:16, padding:'20px', boxShadow:'var(--shadow-card)' }}>
              <p style={{ fontWeight:700, fontSize:'0.9375rem', color:'var(--text-primary)', marginBottom:14 }}>Bridge Status</p>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
                borderRadius:10, background:'var(--bg-surface2)', border:'1px solid var(--border)', marginBottom:hasBridge&&!org?.bridgeOnline?10:0 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', flexShrink:0,
                  background:org?.bridgeOnline?'#22c55e':'var(--text-dim)',
                  boxShadow:org?.bridgeOnline?'0 0 8px #22c55e':'none' }}/>
                <span style={{ fontWeight:600, fontSize:'0.875rem', color:'var(--text-primary)' }}>
                  {!hasBridge?'No bridge created yet':org?.bridgeOnline?'Connected & Online':'Offline — app not running'}
                </span>
              </div>
              {hasBridge && !org?.bridgeOnline && (
                <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', lineHeight:1.6, marginTop:8 }}>
                  Launch the Bridge app on your Windows PC. The status updates within seconds.
                </p>
              )}
              {org?.bridgeOnline && (
                <p style={{ fontSize:'0.8rem', color:'#16a34a', lineHeight:1.6, marginTop:8 }}>
                  ✓ Live — biometric punches sync in real-time.
                </p>
              )}
            </div>

            {/* Download stats — only show if there are downloads */}
            {dlCount > 0 && (
              <div style={{ background:'var(--bg-surface)', border:'1px solid var(--accent-border)',
                borderRadius:16, padding:'20px', boxShadow:'var(--shadow-card)' }}>
                <p style={{ fontWeight:700, fontSize:'0.9375rem', color:'var(--text-primary)', marginBottom:12 }}>Downloads</p>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:'var(--accent-muted)',
                    border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Download size={20} style={{ color:'var(--accent)' }}/>
                  </div>
                  <div>
                    <p style={{ fontSize:'1.5rem', fontWeight:900, color:'var(--accent)', letterSpacing:'-0.03em', lineHeight:1 }}>
                      {dlCount.toLocaleString()}
                    </p>
                    <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginTop:3 }}>total downloads</p>
                  </div>
                </div>
              </div>
            )}

            {/* Quick ref */}
            <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)',
              borderRadius:16, padding:'20px', boxShadow:'var(--shadow-card)' }}>
              <p style={{ fontWeight:700, fontSize:'0.9375rem', color:'var(--text-primary)', marginBottom:14 }}>Quick Reference</p>
              {[
                { icon:Tag,    label:'Bridge ID',  value:bridgeId||'—'  },
                { icon:Wifi,   label:'WS URL',     value:wsUrl||'—'     },
                { icon:Globe,  label:'API URL',    value:apiUrl||'—'    },
                { icon:Shield, label:'WS Secret',  value:wsSecret?'••••••••':'—' },
              ].map(r => (
                <div key={r.label} style={{ marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3 }}>
                    <r.icon size={11} style={{ color:'var(--text-dim)' }}/>
                    <span style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--text-muted)',
                      textTransform:'uppercase', letterSpacing:'0.08em' }}>{r.label}</span>
                  </div>
                  <p style={{ fontSize:'0.78rem', fontFamily:'monospace', color:'var(--text-primary)',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    padding:'6px 10px', borderRadius:7,
                    background:'var(--bg-surface2)', border:'1px solid var(--border)' }}>
                    {r.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Help */}
            <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)',
              borderRadius:16, padding:'20px', boxShadow:'var(--shadow-card)' }}>
              <p style={{ fontWeight:700, fontSize:'0.9375rem', color:'var(--text-primary)', marginBottom:12 }}>Need help?</p>
              {[
                { icon:Zap,         label:'Open a support ticket', href:'/tickets'      },
                { icon:BookOpen,    label:'Documentation',         href:'#'             },
              ].map(l => (
                <a key={l.label} href={l.href}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0',
                    borderBottom:'1px solid var(--border-soft)', textDecoration:'none',
                    color:'var(--text-secondary)', fontSize:'0.875rem', fontWeight:500, transition:'color .15s' }}
                  onMouseEnter={e=>e.currentTarget.style.color='var(--accent)'}
                  onMouseLeave={e=>e.currentTarget.style.color='var(--text-secondary)'}>
                  <l.icon size={14} style={{ color:'var(--text-muted)', flexShrink:0 }}/>{l.label}
                </a>
              ))}
            </div>

            {/* Admin shortcut */}
            {isAdmin && (
              <a href="/admin/plugins" style={{ display:'flex', alignItems:'center', justifyContent:'center',
                gap:7, padding:'11px', borderRadius:11, border:'1px solid var(--border)',
                background:'var(--bg-surface)', color:'var(--accent)', fontSize:'0.875rem',
                fontWeight:700, textDecoration:'none', transition:'all .15s' }}
                onMouseEnter={e=>{e.currentTarget.style.background='var(--accent-muted)';e.currentTarget.style.borderColor='var(--accent-border)'}}
                onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-surface)';e.currentTarget.style.borderColor='var(--border)'}}>
                <Zap size={14}/> Manage Bridge App Settings
              </a>
            )}
          </div>
        </div>
      )}
    </UserPage>
  )
}