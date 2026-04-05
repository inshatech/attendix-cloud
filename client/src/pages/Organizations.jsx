import { useEffect, useState } from 'react'
import { useAuth } from '../store/auth'
import { useOrgContext } from '../store/context'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, Plus, Cpu, Server, Trash2, ChevronDown, ChevronUp,
  MapPin, Phone, Mail, RefreshCw, Link2, Power, PowerOff,
  Edit3, Info, Clock, Wifi, WifiOff, RotateCcw, Volume2, Image,
  Users, UserCheck, UserX, Fingerprint, Copy, CheckCircle2, Key, Globe, Shield,
  Bell, Send, Trash, PlusCircle
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { UserPage, UserStatCard, UserActionBtn } from '../components/ui/UserUI'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Empty } from '../components/ui/Empty'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { ImageUpload } from '../components/ui/ImageUpload'
import { useToast } from '../components/ui/Toast'
import { cn, fmtDate } from '../lib/utils'
import api from '../lib/api'

// Biometric machine image — ESSL K30
// Biometric machine SVG — bright when online, dim when offline
const MachinePlaceholder = ({ online = false }) => {
  const accent  = online ? '#58a6ff' : 'var(--text-dim)'
  const finger  = online ? '#c084fc' : 'var(--text-dim)'
  const screen  = online ? 'rgba(88,166,255,0.35)' : 'var(--border)'
  const screenG = online ? 'rgba(88,166,255,0.6)'  : 'var(--border)'
  const key     = online ? 'var(--bg-surface2)' : 'var(--bg-surface2)'
  const keyPr   = online ? 'rgba(88,166,255,0.4)'  : 'var(--border)'
  const border  = online ? `${accent}60`            : 'var(--border)'
  const bg      = online ? 'rgba(88,166,255,0.1)' : 'var(--bg-surface2)'
  const ledClr  = online ? '#34d399'                : 'var(--text-dim)'
  return (
    <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width:'100%', height:'100%' }}>
      {/* Body */}
      <rect x="2" y="2" width="40" height="40" rx="7" fill={bg} stroke={border} strokeWidth="1.5"/>
      {/* Screen */}
      <rect x="5" y="5" width="22" height="15" rx="2.5" fill={screen} stroke={`${accent}50`} strokeWidth="1"/>
      <rect x="6" y="6" width="8" height="3" rx="1" fill={screenG}/>
      {/* Screen text lines */}
      <rect x="6" y="11" width="14" height="1.5" rx="0.75" fill={`${accent}40`}/>
      <rect x="6" y="14" width="9"  height="1.5" rx="0.75" fill={`${accent}25`}/>
      {/* Keypad grid 3x2 */}
      <rect x="5"  y="23" width="6" height="4" rx="1.5" fill={key}/>
      <rect x="13" y="23" width="6" height="4" rx="1.5" fill={key}/>
      <rect x="5"  y="29" width="6" height="4" rx="1.5" fill={key}/>
      <rect x="13" y="29" width="6" height="4" rx="1.5" fill={key}/>
      {/* Enter key — accent */}
      <rect x="5" y="35" width="14" height="5" rx="1.5" fill={keyPr}/>
      <rect x="7" y="36.5" width="10" height="2" rx="1" fill={online?accent:'var(--border)'}/>
      {/* Fingerprint sensor panel */}
      <rect x="30" y="5" width="12" height="34" rx="3.5" fill={online?'rgba(192,132,252,0.12)':'var(--bg-surface2)'} stroke={`${finger}50`} strokeWidth="1"/>
      {/* Fingerprint arcs */}
      <path d="M36 11c-3 0-5.5 2.5-5.5 5.5" stroke={finger} strokeWidth="1.4" strokeLinecap="round" fill="none"/>
      <path d="M36 13c-1.9 0-3.5 1.6-3.5 3.5" stroke={finger} strokeWidth="1.3" strokeLinecap="round" fill="none"/>
      <path d="M36 15c-.8 0-1.5.7-1.5 1.5" stroke={finger} strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      <path d="M36 11c3 0 5.5 2.5 5.5 5.5" stroke={`${finger}80`} strokeWidth="1.2" strokeLinecap="round" fill="none" strokeDasharray="2 1.5"/>
      <circle cx="36" cy="16.5" r="1" fill={finger}/>
      {/* Finger outline hint */}
      <path d="M33 22 Q36 19 39 22 Q40 25 36 27 Q32 25 33 22Z" fill={online?'rgba(192,132,252,0.15)':'var(--bg-surface2)'} stroke={`${finger}60`} strokeWidth="0.8"/>
      {/* Status LED */}
      <circle cx="36" cy="35" r="2.5" fill={ledClr} opacity={online?1:0.4}/>
      {online && <circle cx="36" cy="35" r="2.5" fill={ledClr} opacity="0.3">
        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite"/>
      </circle>}
    </svg>
  )
}

// ── Device Actions Modal ──────────────────────────────────────────────────────
function DeviceActionsModal({ dev, orgId, bridgeId, open, onClose, onRefresh }) {
  const { toast } = useToast()
  const [info, setInfo]   = useState(null)
  const [time, setTime]   = useState(null)
  const [loadInfo, setLoadInfo] = useState(false)
  const [busy, setBusy]   = useState('')

  async function fetchInfo() {
    setLoadInfo(true)
    try {
      const r = await api.get(`/organizations/${orgId}/devices/${dev.deviceId}/info`)
      setInfo(r.data)
    } catch(e) { toast(e.message, 'error') }
    finally { setLoadInfo(false) }
  }

  async function fetchTime() {
    try {
      const r = await api.get(`/organizations/${orgId}/devices/${dev.deviceId}/time`)
      setTime(r.data.deviceTime)
    } catch(e) { toast(e.message, 'error') }
  }

  async function syncTime() {
    setBusy('synctime')
    try {
      await api.put(`/organizations/${orgId}/devices/${dev.deviceId}/time`, { time: new Date().toISOString() })
      toast('Device time synced to server time', 'success'); fetchTime()
    } catch(e) { toast(e.message, 'error') }
    finally { setBusy('') }
  }

  async function voiceTest() {
    setBusy('voice')
    try { await api.post(`/organizations/${orgId}/devices/${dev.deviceId}/voice-test`); toast('Voice test triggered', 'success') }
    catch(e) { toast(e.message, 'error') }
    finally { setBusy('') }
  }

  async function triggerSync() {
    setBusy('sync')
    try { await api.post(`/organizations/${orgId}/devices/${dev.deviceId}/sync`); toast('Sync triggered', 'success') }
    catch(e) { toast(e.message, 'error') }
    finally { setBusy('') }
  }

  async function connectDev() {
    setBusy('connect')
    try { await api.post(`/organizations/${orgId}/devices/${dev.deviceId}/connect`); toast('Connected', 'success'); onRefresh() }
    catch(e) { toast(e.message, 'error') }
    finally { setBusy('') }
  }

  async function disconnectDev() {
    setBusy('disconnect')
    try { await api.post(`/organizations/${orgId}/devices/${dev.deviceId}/disconnect`); toast('Disconnected', 'success'); onRefresh() }
    catch(e) { toast(e.message, 'error') }
    finally { setBusy('') }
  }

  useEffect(() => { if (open) { fetchInfo(); fetchTime() } }, [open])

  return (
    <Modal open={open} onClose={onClose} title={`${dev.name}`} description={`${dev.ip}:${dev.port} · ${dev.deviceId}`} size="lg">
      <div className="grid sm:grid-cols-2 gap-6">
        {/* Left: machine image + status */}
        <div className="">
          <div className="w-full aspect-square max-w-[180px] mx-auto rounded-xl overflow-hidden" style={{ border:"1px solid var(--border)", background:"var(--bg-surface2)" }} className2="k-950">
            <MachinePlaceholder online={!!dev.online}/>
          </div>
          <div className="text-xs font-mono">
            {[
              { l:'IP Address', v:dev.ip },
              { l:'Port',       v:dev.port },
              { l:'Device ID',  v:dev.deviceId },
              { l:'Model',      v:dev.model||'—' },
              { l:'Location',   v:dev.location||'—' },
              { l:'Status',     v:dev.online?'Online':'Offline', color:dev.online?'text-emerald-400':'' },
              { l:'Device Time',v:time||'Loading…' },
            ].map(r => (
              <div key={r.l} style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"6px 0", borderBottom:"1px solid var(--border-soft)" }}>
                <span style={{ color:"var(--text-muted)" }}>{r.l}</span>
                <span style={{ color:"var(--text-primary)", textAlign:"right", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: device info + actions */}
        <div className="">
          {/* Device hardware info */}
          {loadInfo ? (
            <div className="">{[1,2,3].map(i=><div key={i} className="h-8 shimmer"/>)}</div>
          ) : info ? (
            <div className="card-sm p-3 .5 text-xs font-mono">
              <p style={{ color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.12em", fontSize:"0.625rem", marginBottom:8 }}>Hardware Info</p>
              {[
                { l:'Device Name', v:info.name },
                { l:'Version',     v:info.version },
                { l:'OS',          v:info.os },
                { l:'Platform',    v:info.platform },
                { l:'MAC',         v:info.mac },
              ].filter(r=>r.v).map(r=>(
                <div key={r.l} className="flex justify-between gap-2">
                  <span style={{ color:"var(--text-dim)" }}>{r.l}</span>
                  <span style={{ color:"var(--text-secondary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.v}</span>
                </div>
              ))}
              {info.stats && (
                <div style={{ paddingTop:8, borderTop:"1px solid var(--border-soft)", display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                  {[
                    { l:'Users',      v:info.stats?.UserCount },
                    { l:'Attendance', v:info.stats?.AttLogCount },
                    { l:'Admins',     v:info.stats?.AdminCount },
                  ].filter(r=>r.v!==undefined).map(r=>(
                    <div key={r.l} className="text-center"><p className="text-lime-400 font-bold">{r.v}</p><p style={{ color:"var(--text-dim)", fontSize:"0.5625rem" }}>{r.l}</p></div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Actions */}
          <div className="">
            <p className="field-label">Actions</p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="secondary" onClick={triggerSync} loading={busy==='sync'}>
                <RefreshCw size={12}/> Sync Data
              </Button>
              <Button size="sm" variant="secondary" onClick={syncTime} loading={busy==='synctime'}>
                <Clock size={12}/> Sync Time
              </Button>
              <Button size="sm" variant="secondary" onClick={voiceTest} loading={busy==='voice'}>
                <Volume2 size={12}/> Voice Test
              </Button>
              <Button size="sm" variant="secondary" onClick={fetchInfo} loading={loadInfo}>
                <Info size={12}/> Refresh Info
              </Button>
              {dev.online ? (
                <Button size="sm" variant="secondary" onClick={disconnectDev} loading={busy==='disconnect'}>
                  <WifiOff size={12}/> Disconnect
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={connectDev} loading={busy==='connect'}>
                  <Wifi size={12}/> Connect
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}

// ── Machine Users Modal ───────────────────────────────────────────────────────
function MachineUsersModal({ open, onClose, dev, orgId }) {
  const { toast } = useToast()
  const [muList,  setMuList] = useState([])
  const [loadMU,  setLoadMU] = useState(false)
  const [meta,    setMeta]   = useState({ total:0, linked:0 })
  const [q,       setQ]      = useState('')

  async function load() {
    setLoadMU(true)
    try {
      const r = await api.get(`/organizations/${orgId}/devices/${dev.deviceId}/users`)
      setMuList(r.data || [])
      setMeta({ total: r.total || r.data?.length || 0, linked: r.linked || 0 })
    } catch(e) { toast(e.message,'error') }
    finally { setLoadMU(false) }
  }

  useEffect(() => { if (open) { setQ(''); load() } }, [open])

  const filtered = q
    ? muList.filter(m => (m.name||'').toLowerCase().includes(q.toLowerCase()) || String(m.uid).includes(q))
    : muList

  return (
    <Modal open={open} onClose={onClose} title="Machine Users" size="md">
      {/* Search + meta */}
      <div className="flex items-center gap-3 mb-4">
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search by name or UID…"
          className="field-input flex-1 text-sm"/>
        <span style={{ fontSize:"0.75rem", fontFamily:"monospace", color:"var(--text-muted)", whiteSpace:"nowrap", flexShrink:0 }}>
          {meta.linked} linked / {meta.total} total
        </span>
        <button onClick={load} className="btn-icon btn-sm flex-shrink-0" title="Refresh">
          <RefreshCw size={13}/>
        </button>
      </div>

      {/* List */}
      <div style={{ maxHeight:'60vh', overflowY:'auto', paddingRight:4, display:'flex', flexDirection:'column', gap:8 }}>
        {loadMU ? (
          Array.from({length:5}).map((_,i) => <div key={i} className="h-16 shimmer rounded-xl"/>)
        ) : filtered.length === 0 ? (
          <p style={{ fontSize:"0.875rem", color:"var(--text-dim)", textAlign:"center", padding:"32px 0" }}>
            {muList.length === 0 ? 'No users enrolled. Sync device first.' : 'No results.'}
          </p>
        ) : filtered.map(mu => {
          const emp     = mu.employee
          const muName  = mu.name || `UID ${mu.uid}`
          const empName = emp ? (emp.displayName || `${emp.firstName} ${emp.lastName||''}`.trim()) : null
          return (
            <div key={mu._id || mu.uid}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", borderRadius:12, border:"1px solid var(--border)", background:"var(--bg-surface2)", transition:"all .15s" }}>
              {/* Fingerprint avatar */}
              <div style={{ width:40, height:40, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", border:"1px solid var(--border)", background:"var(--bg-elevated)", overflow:"hidden" }}>
                {emp?.photoUrl
                  ? <img src={emp.photoUrl} alt="" className="w-full h-full object-cover"/>
                  : <Fingerprint size={18} className="text-accent"/>}
              </div>
              {/* Name + UID */}
              <div className="flex-1 min-w-0">
                <p style={{ fontSize:"0.875rem", fontWeight:700, color:"var(--text-primary)", textTransform:"uppercase", letterSpacing:"0.05em", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{muName}</p>
                <p style={{ fontSize:"0.625rem", fontFamily:"monospace", color:"var(--text-muted)", marginTop:2 }}>
                  UID:{mu.uid} · {mu.deviceId} · {mu.role ?? 0}
                </p>
              </div>
              {/* Linked employee / Unlinked */}
              <div className="flex-shrink-0 text-right max-w-[160px] min-w-0">
                {emp ? (
                  <>
                    <p className="text-sm font-bold truncate" style={{color:'#34d399'}}>{empName}</p>
                    <p style={{ fontSize:"0.625rem", fontFamily:"monospace", color:"var(--text-muted)" }}>{emp.employeeCode}</p>
                  </>
                ) : (
                  <p className="text-sm font-semibold" style={{color:'#f87171'}}>Unlinked</p>
                )}
              </div>
              {/* Sync icon */}
              <RotateCcw size={14} style={{ color:"var(--text-dim)", flexShrink:0 }}/>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

// ── Device Row ────────────────────────────────────────────────────────────────
function DeviceRow({ dev, orgId, onRefresh, onEdit, onDetail }) {
  const { toast } = useToast()
  const [busy,     setBusy]  = useState(false)
  const [delModal, setDel]   = useState(false)
  const [muModal,  setMuModal] = useState(false)

  async function toggleEnabled() {
    setBusy(true)
    try {
      await api.patch(`/organizations/${orgId}/devices/${dev.deviceId}/enabled`, { enabled: !dev.enabled })
      toast(`Device ${dev.enabled?'disabled':'enabled'}`, 'success'); onRefresh()
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true)
    try { await api.delete(`/organizations/${orgId}/devices/${dev.deviceId}`); toast('Device removed','success'); onRefresh() }
    catch(e) { toast(e.message,'error') }
    finally { setBusy(false); setDel(false) }
  }

  return (
    <>
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:12, borderRadius:12, border:"1px solid var(--border)", background:"var(--bg-surface2)", transition:"all .15s" }}>
        <div style={{ width:40, height:40, borderRadius:10, overflow:"hidden", flexShrink:0, border:"1px solid var(--border)", background:"var(--bg-input)" }}>
          <MachinePlaceholder online={!!dev.online}/>
        </div>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize:"0.875rem", fontWeight:600, color:"var(--text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{dev.name}</p>
          <p style={{ fontSize:"0.75rem", fontFamily:"monospace", color:"var(--text-muted)" }}>{dev.ip}:{dev.port}{dev.model?` · ${dev.model}`:''}{dev.location?` · ${dev.location}`:''}</p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
          {dev.online ? <Badge variant="green" dot>Online</Badge>
            : dev.enabled===false ? <Badge variant="red" dot>Disabled</Badge>
            : <Badge variant="gray" dot>Offline</Badge>}
          <UserActionBtn label="Users" icon={Users} onClick={() => setMuModal(true)} hoverColor="#c084fc"/>
          <UserActionBtn label="Details"                           icon={Info}     onClick={() => onDetail(dev)} hoverColor="#58a6ff"/>
          <UserActionBtn label="Edit"                               icon={Edit3}    onClick={() => onEdit(dev)}   hoverColor="#facc15"/>
          <UserActionBtn label={dev.enabled?'Disable':'Enable'}     icon={dev.enabled?PowerOff:Power} onClick={toggleEnabled} disabled={busy}
            hoverColor={dev.enabled?'#f87171':'#34d399'} danger={dev.enabled}/>
          <UserActionBtn label="Delete" icon={Trash2} onClick={() => setDel(true)} danger/>
        </div>
      </div>

      <MachineUsersModal open={muModal} onClose={() => setMuModal(false)} dev={dev} orgId={orgId}/>
      <ConfirmModal open={delModal} onClose={() => setDel(false)} onConfirm={remove} loading={busy} danger
        title="Remove Machine" message={`Remove "${dev.name}"? All its data (attendance, users) will be permanently deleted.`}/>
    </>
  )
}


// ── Bridge Info Modal — shown after bridge creation ───────────────────────────
function BridgeInfoModal({ info, onClose }) {
  const { toast } = useToast()
  const [copied, setCopied] = useState({})

  function copy(label, value) {
    if (!value) return
    navigator.clipboard.writeText(value).then(() => {
      setCopied(p => ({ ...p, [label]: true }))
      setTimeout(() => setCopied(p => ({ ...p, [label]: false })), 2000)
      toast(`${label} copied!`, 'success')
    })
  }

  const fields = [
    { icon:Key,    label:'Bridge ID',           value:info.bridgeId, secret:false, hint:'Unique ID for this organization bridge'      },
    { icon:Wifi,   label:'WebSocket Server URL', value:info.wsUrl,    secret:false, hint:'Paste this into the Bridge app'                 },
    { icon:Globe,  label:'Server API URL',       value:info.apiUrl,   secret:false, hint:'REST endpoint for sync'                         },
    { icon:Shield, label:'WebSocket Secret',     value:info.wsSecret, secret:true,  hint:'Keep private — authenticates the bridge'        },
  ]

  return (
    <Modal open={true} onClose={onClose} title={null} size="md" noBodyPad>
      <div style={{ padding:'28px 28px 24px' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:24 }}>
          <div style={{ width:52, height:52, borderRadius:15, flexShrink:0,
            background:'rgba(52,211,153,.1)', border:'1px solid rgba(52,211,153,.25)',
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <CheckCircle2 size={26} style={{ color:'#16a34a' }}/>
          </div>
          <div>
            <h3 style={{ fontSize:'1.25rem', fontWeight:900, color:'var(--text-primary)',
              letterSpacing:'-0.02em', marginBottom:4 }}>Bridge Created!</h3>
            <p style={{ fontSize:'0.875rem', color:'var(--text-muted)', lineHeight:1.6 }}>
              Copy these credentials into the Bridge desktop app to connect your biometric machines.
            </p>
          </div>
          <button onClick={onClose}
            style={{ marginLeft:'auto', width:30, height:30, borderRadius:8, flexShrink:0,
              border:'1px solid var(--border)', background:'var(--bg-surface2)',
              display:'flex', alignItems:'center', justifyContent:'center',
              cursor:'pointer', color:'var(--text-muted)' }}
            onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-elevated)';e.currentTarget.style.color='var(--text-primary)'}}
            onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-surface2)';e.currentTarget.style.color='var(--text-muted)'}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Fields */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
          {fields.map(f => {
            const isCopied = copied[f.label]
            return (
              <div key={f.label}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                  <f.icon size={12} style={{ color:'var(--text-dim)' }}/>
                  <span style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--text-muted)',
                    textTransform:'uppercase', letterSpacing:'0.08em' }}>{f.label}</span>
                </div>
                <div style={{ display:'flex', border:'1.5px solid var(--border)', borderRadius:10,
                  background:'var(--bg-input)', overflow:'hidden', transition:'border-color .2s' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border-bright)'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                  <span style={{ flex:1, padding:'10px 13px', fontSize:'0.875rem',
                    fontFamily:'monospace', color:f.value?'var(--text-primary)':'var(--text-dim)',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', userSelect:'all' }}>
                    {f.value
                      ? (f.secret && !copied['show_'+f.label] ? '•'.repeat(Math.min(f.value.length, 28)) : f.value)
                      : '— not configured —'}
                  </span>
                  {f.secret && f.value && (
                    <button onClick={()=>setCopied(p=>({...p,['show_'+f.label]:!p['show_'+f.label]}))}
                      style={{ padding:'0 11px', background:'none', border:'none',
                        borderLeft:'1px solid var(--border)', cursor:'pointer',
                        color:'var(--text-muted)', display:'flex', alignItems:'center' }}>
                      <ChevronDown size={13} style={{ transform:copied['show_'+f.label]?'rotate(180deg)':'none', transition:'transform .2s' }}/>
                    </button>
                  )}
                  <button onClick={()=>copy(f.label, f.value)} disabled={!f.value}
                    style={{ padding:'0 14px', background:isCopied?'rgba(52,211,153,.1)':'transparent',
                      border:'none', borderLeft:'1px solid var(--border)',
                      cursor:f.value?'pointer':'not-allowed',
                      color:isCopied?'#16a34a':'var(--text-muted)',
                      display:'flex', alignItems:'center', gap:5,
                      fontSize:'0.8rem', fontWeight:600, transition:'all .2s',
                      whiteSpace:'nowrap', minWidth:72 }}>
                    {isCopied ? <><CheckCircle2 size={12}/> Copied</> : <><Copy size={12}/> Copy</>}
                  </button>
                </div>
                {f.hint && <p style={{ fontSize:'0.72rem', color:'var(--text-dim)', marginTop:3 }}>{f.hint}</p>}
              </div>
            )
          })}
        </div>

        {/* Info note */}
        <div style={{ padding:'12px 14px', borderRadius:10, background:'var(--accent-muted)',
          border:'1px solid var(--accent-border)', marginBottom:20 }}>
          <p style={{ fontSize:'0.8125rem', color:'var(--text-muted)', lineHeight:1.65 }}>
            Open the Bridge app on your Windows PC → <strong style={{ color:'var(--text-primary)' }}>Configure</strong> → 
            paste all 4 values → click <strong style={{ color:'var(--text-primary)' }}>Connect</strong>. 
            You can always find these again on the <a href="/bridge-setup" style={{ color:'var(--accent)', fontWeight:700 }}>Bridge Setup</a> page.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={()=>copy('All Credentials',
            `Bridge ID: ${info.bridgeId}\nWebSocket URL: ${info.wsUrl}\nAPI URL: ${info.apiUrl}\nWS Secret: ${info.wsSecret}`)}
            style={{ flex:1, padding:'11px', borderRadius:10, border:'1px solid var(--border)',
              background:'var(--bg-surface2)', color:'var(--text-secondary)', fontWeight:700,
              fontSize:'0.875rem', cursor:'pointer', display:'flex', alignItems:'center',
              justifyContent:'center', gap:7, transition:'all .15s' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--border-bright)';e.currentTarget.style.background='var(--bg-elevated)'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='var(--bg-surface2)'}}>
            <Copy size={14}/> Copy All
          </button>
          <button onClick={onClose}
            style={{ flex:1, padding:'11px', borderRadius:10, border:'none',
              background:'var(--accent)', color:'#fff', fontWeight:800,
              fontSize:'0.875rem', cursor:'pointer', display:'flex', alignItems:'center',
              justifyContent:'center', gap:7, transition:'all .15s',
              boxShadow:'0 4px 14px var(--accent-muted)' }}>
            <CheckCircle2 size={14}/> Done
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Logo Upload ───────────────────────────────────────────────────────────────
function OrgLogo({ org, onUpdate }) {
  const { toast } = useToast()
  const [uploading, setUploading] = useState(false)
  const [modal, setModal]         = useState(false)

  async function handleChange(base64) {
    setUploading(true)
    try {
      const r = await api.post(`/organizations/${org.orgId}/logo`, { image: base64 })
      onUpdate(r.logoUrl); toast(`Logo updated · ${r.size}`,'success'); setModal(false)
    } catch(e) { toast(e.message,'error') }
    finally { setUploading(false) }
  }
  async function handleRemove() {
    setUploading(true)
    try { await api.delete(`/organizations/${org.orgId}/logo`); onUpdate(null); toast('Logo removed','success'); setModal(false) }
    catch(e) { toast(e.message,'error') }
    finally { setUploading(false) }
  }

  return (
    <>
      <button onClick={() => setModal(true)} title="Change logo"
        style={{ position:"relative", width:44, height:44, borderRadius:12, overflow:"hidden", flexShrink:0, border:"1px solid var(--border)", background:"var(--bg-surface2)", transition:"all .15s" }}>
        {org.logoUrl
          ? <><img src={org.logoUrl} alt={org.name} className="w-full h-full object-cover"/>
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Image size={12} className="text-white"/></div>
            </>
          : <div className="w-full h-full flex items-center justify-center text-base">🏢</div>}
      </button>
      <Modal open={modal} onClose={() => setModal(false)} title="Organization Logo" description="400×200px recommended · auto-compressed to WebP" size="sm">
        <ImageUpload value={org.logoUrl} onChange={handleChange} onRemove={org.logoUrl?handleRemove:undefined}
          loading={uploading} placeholder="Click or drag to upload logo" hint="Recommended: 400×200px · max 5MB · auto-WebP"/>
        <div className="flex justify-end"><Button variant="secondary" size="sm" onClick={() => setModal(false)}>Done</Button></div>
      </Modal>
    </>
  )
}

// ── Org Card ──────────────────────────────────────────────────────────────────
// ── Report Schedule Modal ─────────────────────────────────────────────────────
const TIMEZONES = [
  'Asia/Kolkata','Asia/Karachi','Asia/Dhaka','Asia/Dubai','Asia/Singapore',
  'Asia/Tokyo','Asia/Shanghai','Europe/London','Europe/Paris','Europe/Berlin',
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
  'Australia/Sydney','Africa/Nairobi','Pacific/Auckland',
]

const EMPTY_RECIP = { name: '', email: '', mobile: '' }

function ReportScheduleModal({ open, onClose, orgId }) {
  const [sch,      setSch]    = useState({ enabled: false, sendTime: '20:00', timezone: 'Asia/Kolkata', recipients: [] })
  const [loading,  setLoad]   = useState(false)
  const [busy,     setBusy]   = useState(false)
  const [sending,  setSend]   = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!open || !orgId) return
    setLoad(true); setLastResult(null)
    api.get(`/organizations/${orgId}/report-schedule`)
      .then(r => setSch({
        enabled:    r.data?.enabled    ?? false,
        sendTime:   r.data?.sendTime   || '20:00',
        timezone:   r.data?.timezone   || 'Asia/Kolkata',
        recipients: r.data?.recipients || [],
      }))
      .catch(() => {})
      .finally(() => setLoad(false))
  }, [open, orgId])

  function setField(k, v) { setSch(s => ({ ...s, [k]: v })) }

  function addRecipient() {
    setSch(s => ({ ...s, recipients: [...s.recipients, { ...EMPTY_RECIP }] }))
  }
  function removeRecipient(i) {
    setSch(s => ({ ...s, recipients: s.recipients.filter((_, j) => j !== i) }))
  }
  function updateRecipient(i, k, v) {
    setSch(s => ({ ...s, recipients: s.recipients.map((r, j) => j === i ? { ...r, [k]: v } : r) }))
  }

  async function save() {
    setBusy(true)
    try {
      await api.put(`/organizations/${orgId}/report-schedule`, sch)
      toast('Report schedule saved', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function sendNow() {
    setSend(true); setLastResult(null)
    try {
      const r = await api.post(`/organizations/${orgId}/reports/send-now`)
      setLastResult(r)
      toast(`Sent! ${r.emailSent} email(s)${r.waSent ? `, ${r.waSent} WhatsApp` : ''}`, 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setSend(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Daily Attendance Report" description="Automated end-of-day summary via Email & WhatsApp" size="lg">
      {loading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>Loading…</div>
      ) : (<>
        {/* Enable + time + timezone */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Toggle row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 10, background: 'var(--bg-surface2)', border: '1px solid var(--border)' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Bell size={13} style={{ color: 'var(--accent)' }}/> Automated Daily Report
              </p>
              <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                Sends at the scheduled time every day
              </p>
            </div>
            <button onClick={() => setField('enabled', !sch.enabled)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', transition: 'all .2s', position: 'relative',
                background: sch.enabled ? 'var(--accent)' : 'var(--bg-elevated)',
              }}>
              <span style={{
                position: 'absolute', top: 3, left: sch.enabled ? 22 : 3,
                width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s',
              }}/>
            </button>
          </div>

          {/* Time + Timezone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label flex items-center gap-1.5"><Clock size={10}/> Send Time (24h)</label>
              <input type="time" className="field-input" value={sch.sendTime}
                onChange={e => setField('sendTime', e.target.value)}
                style={{ fontFamily: 'monospace' }}/>
            </div>
            <div>
              <label className="field-label flex items-center gap-1.5"><Globe size={10}/> Timezone</label>
              <select className="field-input" value={sch.timezone} onChange={e => setField('timezone', e.target.value)}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>

          {/* Recipients */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label className="field-label" style={{ margin: 0 }}>Recipients · {sch.recipients.length}</label>
              <button onClick={addRecipient}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                <PlusCircle size={12}/> Add
              </button>
            </div>

            {sch.recipients.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'monospace', border: '1px dashed var(--border)', borderRadius: 8 }}>
                No recipients yet. Add email / WhatsApp contacts.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '22vh', overflowY: 'auto' }}>
                {sch.recipients.map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.1fr auto', gap: 6, alignItems: 'center' }}>
                    <input className="field-input" placeholder="Name" value={r.name}
                      onChange={e => updateRecipient(i, 'name', e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '0.8rem' }}/>
                    <input className="field-input" placeholder="Email" type="email" value={r.email}
                      onChange={e => updateRecipient(i, 'email', e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '0.8rem' }}/>
                    <input className="field-input" placeholder="+91 mobile (WA)" value={r.mobile}
                      onChange={e => updateRecipient(i, 'mobile', e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '0.8rem', fontFamily: 'monospace' }}/>
                    <button onClick={() => removeRecipient(i)}
                      className="btn-icon btn-sm hover:text-red-400 hover:bg-red-500/10">
                      <Trash size={12}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info box */}
          <div style={{ display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--accent-muted)', border: '1px solid var(--accent-border)' }}>
            <Bell size={13} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}/>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Email is sent via SMTP plugin. WhatsApp is sent only if the WhatsApp plugin is enabled by admin.
              Mobile numbers must include country code (e.g. +91 9876543210).
            </p>
          </div>

          {/* Last send result */}
          {lastResult && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(52,211,153,.07)', border: '1px solid rgba(52,211,153,.2)', fontSize: '0.75rem', fontFamily: 'monospace', color: '#34d399' }}>
              ✓ Sent — {lastResult.emailSent} email(s){lastResult.waSent ? `, ${lastResult.waSent} WhatsApp` : ''}
              {` · Present: ${lastResult.summary?.present}, Absent: ${lastResult.summary?.absent}, Late: ${lastResult.summary?.late}`}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <Button variant="secondary" onClick={sendNow} loading={sending} disabled={!sch.recipients.length}>
            <Send size={13}/> Send Now
          </Button>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={save} loading={busy}><Bell size={13}/> Save Schedule</Button>
          </div>
        </div>
      </>)}
    </Modal>
  )
}

function OrgCard({ org: init, onRefresh }) {
  const [org, setOrg]         = useState(init)
  const [open, setOpen]       = useState(false)
  const [devices, setDevices] = useState([])
  const [loadDev, setLoadDev] = useState(false)
  const [showAddDev, setShowAddDev]   = useState(false)
  const [showEditDev, setShowEditDev] = useState(false)
  const [showDetailDev, setShowDetail]= useState(false)
  const [showBridge, setShowBridge]   = useState(false)
  const [bridgeInfo,  setBridgeInfo]   = useState(null)
  const [showEditOrg, setShowEditOrg] = useState(false)
  const [showDelete, setShowDelete]   = useState(false)
  const [showReport, setShowReport]   = useState(false)
  const [selectedDev, setSelectedDev] = useState(null)
  const [devForm, setDevForm] = useState({ ip:'', port:'4370', name:'', model:'', location:'' })
  const [editOrgForm, setEditOrgForm] = useState({})
  const [bridgeId, setBridgeId]= useState('')
  const [busy, setBusy]       = useState(false)
  const { toast } = useToast()

  useEffect(() => { setOrg(init) }, [init])

  async function loadDevices() {
    if (!org.bridgeId) return
    setLoadDev(true)
    try { const r = await api.get(`/organizations/${org.orgId}/devices`); setDevices(r.data||[]) }
    catch {} finally { setLoadDev(false) }
  }

  // Subscribe to real-time device status via SSE
  useEffect(() => {
    if (!org.bridgeId) return
    const token = sessionStorage.getItem('at')
    if (!token) return
    let es
    try {
      es = new EventSource(`/api/${org.bridgeId}/attendance/realtime?token=${token}`)
      // On (re)connect the server immediately pushes current statuses — apply them
      es.onopen = () => {
        // Server will push DEVICE_STATUS events right after SSE connect; also refresh from REST
        loadDevices()
      }
      es.onmessage = e => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'DEVICE_STATUS' && msg.bridgeId === org.bridgeId) {
            setDevices(prev => prev.map(d =>
              d.deviceId === msg.deviceId ? { ...d, online: msg.status === 'online' } : d
            ))
          }
        } catch {}
      }
    } catch {}
    return () => { try { es?.close() } catch {} }
  }, [org.bridgeId]) // eslint-disable-line

  function togglePanel() { setOpen(v=>!v); if (!open) loadDevices() }

  const sdf = k => e => setDevForm(f=>({...f,[k]:e.target.value}))
  const sef = k => e => setEditOrgForm(f=>({...f,[k]:e.target.value}))

  async function addDevice() {
    if (!devForm.ip) return toast('IP address required','error')
    setBusy(true)
    try {
      await api.post(`/organizations/${org.orgId}/devices`, { ip:devForm.ip, port:Number(devForm.port)||4370, name:devForm.name||'Biometric Machine', model:devForm.model, location:devForm.location })
      toast('Machine added!','success'); setShowAddDev(false); setDevForm({ ip:'',port:'4370',name:'',model:'',location:'' }); loadDevices()
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(false) }
  }

  async function editDevice() {
    if (!selectedDev) return
    setBusy(true)
    try {
      await api.patch(`/organizations/${org.orgId}/devices/${selectedDev.deviceId}`, { ip:devForm.ip, port:Number(devForm.port)||4370, name:devForm.name, model:devForm.model, location:devForm.location })
      toast('Machine updated!','success'); setShowEditDev(false); loadDevices()
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(false) }
  }

  function openEditDevice(dev) {
    setSelectedDev(dev); setDevForm({ ip:dev.ip, port:String(dev.port), name:dev.name, model:dev.model||'', location:dev.location||'' })
    setShowEditDev(true)
  }

  async function saveEditOrg() {
    setBusy(true)
    try {
      const r = await api.patch(`/organizations/${org.orgId}`, editOrgForm)
      setOrg(r.data); toast('Organization updated','success'); setShowEditOrg(false)
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(false) }
  }

  async function connectBridge() {
    if (!bridgeId.trim()) return toast('Enter bridge ID','error')
    setBusy(true)
    try { await api.post(`/organizations/${org.orgId}/bridge/connect`,{bridgeId:bridgeId.trim()}); toast('Bridge connected!','success'); setShowBridge(false); setBridgeId(''); onRefresh() }
    catch(e) { toast(e.message,'error') }
    finally { setBusy(false) }
  }

  async function createBridge() {
    setBusy(true)
    try {
      const r = await api.post(`/organizations/${org.orgId}/bridge/create`,{name:`${org.name} Bridge`})
      setShowBridge(false)
      // Fetch full config to show in modal
      const cfg = await api.get(`/organizations/${org.orgId}/bridge-config`).catch(()=>null)
      setBridgeInfo({
        bridgeId  : r.data.bridgeId,
        wsUrl     : cfg?.data?.wsUrl    || cfg?.wsUrl    || '',
        apiUrl    : cfg?.data?.apiUrl   || cfg?.apiUrl   || '',
        wsSecret  : cfg?.data?.wsSecret || cfg?.wsSecret || '',
      })
      onRefresh()
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(false) }
  }

  async function showCredentials() {
    setBusy(true)
    try {
      const cfg = await api.get(`/organizations/${org.orgId}/bridge-config`)
      const data = cfg?.data || cfg || {}
      setBridgeInfo({
        bridgeId : org.bridgeId,
        wsUrl    : data.wsUrl    || '',
        apiUrl   : data.apiUrl   || '',
        wsSecret : data.wsSecret || '',
      })
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(false) }
  }

  async function deleteOrg() {
    setBusy(true)
    try { await api.delete(`/organizations/${org.orgId}`); toast('Deleted','success'); onRefresh() }
    catch(e) { toast(e.message,'error') }
    finally { setBusy(false); setShowDelete(false) }
  }

  // Plain function — NOT a component. Avoids re-mount on every keystroke.
  function devFormFields() {
    return (
      <div className="">
        <Input label="IP Address *" value={devForm.ip}       onChange={sdf('ip')}       placeholder="192.168.1.100"/>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Port"  type="number" value={devForm.port}     onChange={sdf('port')}     placeholder="4370"/>
          <Input label="Label" value={devForm.name}      onChange={sdf('name')}     placeholder="Main Gate"/>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Model"    value={devForm.model}    onChange={sdf('model')}    placeholder="ZK-K40 Pro"/>
          <Input label="Location" value={devForm.location} onChange={sdf('location')} placeholder="Ground Floor"/>
        </div>
      </div>
    )
  }

  return (
    <motion.div layout className={cn('card overflow-hidden', !org.isActive && 'opacity-60')}>
      <div className="p-5">
        <div className="flex items-start gap-4">
          <OrgLogo org={org} onUpdate={url => setOrg(o=>({...o, logoUrl:url}))}/>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 style={{ fontWeight:700, color:"var(--text-primary)" }}>{org.name}</h3>
              {!org.isActive ? <Badge variant="red" dot>Suspended</Badge>
                : org.bridgeOnline ? <Badge variant="green" dot>Online</Badge>
                : org.bridgeId    ? <Badge variant="gray" dot>Bridge Offline</Badge>
                : <Badge variant="orange">No Bridge</Badge>}
            </div>
            <div className="flex flex-wrap gap-3">
              {org.city     && <span style={{ fontSize:"0.75rem", color:"var(--text-muted)", display:"flex", alignItems:"center", gap:4 }}><MapPin size={11}/>{org.city}</span>}
              {org.industry && <span style={{ fontSize:"0.75rem", color:"var(--text-muted)" }}>{org.industry}</span>}
              {org.bridgeId && <span style={{ fontSize:"0.75rem", fontFamily:"monospace", color:"var(--text-dim)" }}>{org.bridgeId}</span>}
              {(org.deviceCount > 0) && <span style={{ fontSize:"0.75rem", color:"var(--text-muted)", display:"flex", alignItems:"center", gap:4 }}><Cpu size={11}/>{org.deviceCount} device{org.deviceCount!==1?'s':''}</span>}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
            <UserActionBtn label="Edit" icon={Edit3} onClick={() => { setEditOrgForm({ name:org.name,industry:org.industry||'',city:org.city||'',address:org.address||'',phone:org.phone||'',email:org.email||'' }); setShowEditOrg(true) }} hoverColor="#facc15"/>
            {!org.bridgeId ? (
              <Button size="sm" onClick={() => setShowBridge(true)} style={{ background:'var(--accent)', color:'#fff', border:'none', boxShadow:'0 3px 10px var(--accent-muted)' }}>
                <Wifi size={13}/> Setup Bridge
              </Button>
            ) : (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <Button size="sm" variant="secondary" onClick={showCredentials}><Key size={13}/> Credentials</Button>
                <Button size="sm" variant="secondary" onClick={() => setShowReport(true)}>
                  <Bell size={13}/> Report
                  {org.reportSchedule?.enabled && <span style={{ width:6, height:6, borderRadius:'50%', background:'#34d399', display:'inline-block', marginLeft:2 }}/>}
                </Button>
                <Button size="sm" variant="secondary" onClick={togglePanel}><Cpu size={13}/> Machines {open?<ChevronUp size={12}/>:<ChevronDown size={12}/>}</Button>
              </div>
            )}
            <UserActionBtn label="Delete" icon={Trash2} onClick={() => setShowDelete(true)} danger/>
          </div>
        </div>
      </div>

      {/* Devices panel */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }} style={{ overflow:"hidden", borderTop:"1px solid var(--border)" }}>
            <div className="p-5 ">
              <div className="flex items-center justify-between">
                <p style={{ fontSize:"0.75rem", fontFamily:"monospace", color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.1em" }}>Biometric Machines</p>
                <Button size="sm" onClick={() => { setDevForm({ ip:'',port:'4370',name:'',model:'',location:'' }); setShowAddDev(true) }}><Plus size={13}/> Add Machine</Button>
              </div>
              {loadDev ? <div className="">{[1,2].map(i=><div key={i} className="h-14 shimmer"/>)}</div>
                : devices.length === 0 ? <Empty icon={Cpu} title="No machines" description="Add a biometric device to get started"/>
                : <div className="">{devices.map(d=>(
                    <DeviceRow key={d.deviceId} dev={d} orgId={org.orgId}
                      onRefresh={loadDevices}
                      onEdit={openEditDevice}
                      onDetail={dev => { setSelectedDev(dev); setShowDetail(true) }}
                    />
                  ))}</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <Modal open={showAddDev} onClose={() => setShowAddDev(false)} title="Add Biometric Machine" description={`→ ${org.name}`}>
        {devFormFields()}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowAddDev(false)}>Cancel</Button><Button onClick={addDevice} loading={busy}>Add Machine</Button></div>
      </Modal>

      <Modal open={showEditDev} onClose={() => setShowEditDev(false)} title="Edit Machine" description={selectedDev?.deviceId}>
        {devFormFields()}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowEditDev(false)}>Cancel</Button><Button onClick={editDevice} loading={busy}>Save Changes</Button></div>
      </Modal>

      {selectedDev && (
        <DeviceActionsModal dev={selectedDev} orgId={org.orgId} bridgeId={org.bridgeId}
          open={showDetailDev} onClose={() => setShowDetail(false)} onRefresh={loadDevices}/>
      )}

      <ReportScheduleModal open={showReport} onClose={() => setShowReport(false)} orgId={org.orgId}/>

      <Modal open={showEditOrg} onClose={() => setShowEditOrg(false)} title="Edit Organization" size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Input label="Name *" value={editOrgForm.name||''} onChange={sef('name')} placeholder="Acme Corp"/></div>
          <Input label="Industry" value={editOrgForm.industry||''} onChange={sef('industry')} placeholder="Manufacturing"/>
          <Input label="City"     value={editOrgForm.city||''}     onChange={sef('city')}     placeholder="Mumbai"/>
          <div className="col-span-2"><Input label="Address" value={editOrgForm.address||''} onChange={sef('address')} placeholder="Street address"/></div>
          <Input label="Phone" icon={Phone} value={editOrgForm.phone||''} onChange={sef('phone')} placeholder="+91..." type="tel"/>
          <Input label="Email" icon={Mail}  value={editOrgForm.email||''} onChange={sef('email')} placeholder="hr@co.com" type="email"/>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowEditOrg(false)}>Cancel</Button><Button onClick={saveEditOrg} loading={busy}>Save Changes</Button></div>
      </Modal>

      <Modal open={showBridge} onClose={() => setShowBridge(false)} title="Bridge Setup" description={`Configure bridge for ${org.name}`} size="sm">
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

          {/* PRIMARY — Create Bridge */}
          <motion.button onClick={createBridge} disabled={busy}
            whileHover={{ scale:busy?1:1.015 }} whileTap={{ scale:.975 }}
            style={{ padding:'18px 20px', borderRadius:14, border:'2px solid var(--accent-border)',
              background:'var(--accent-muted)', cursor:busy?'not-allowed':'pointer',
              textAlign:'left', transition:'all .2s', opacity:busy?.6:1 }}
            onMouseEnter={e=>{ if(!busy){e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.background='rgba(88,166,255,.12)'}}}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--accent-border)';e.currentTarget.style.background='var(--accent-muted)'}}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:11, background:'var(--accent)',
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {busy
                  ? <motion.div animate={{rotate:360}} transition={{duration:.7,repeat:Infinity,ease:'linear'}}
                      style={{width:16,height:16,borderRadius:'50%',border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff'}}/>
                  : <Wifi size={18} style={{ color:'#fff' }}/>}
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontWeight:800, fontSize:'0.9375rem', color:'var(--text-primary)', lineHeight:1.2, marginBottom:3 }}>
                  {busy ? 'Creating bridge…' : 'Create New Bridge'}
                </p>
                <p style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>
                  Auto-generate a unique Bridge ID for this organization
                </p>
              </div>
              {!busy && <span style={{ fontSize:'0.7rem', fontWeight:700, padding:'3px 10px', borderRadius:99,
                background:'var(--accent)', color:'#fff', flexShrink:0, whiteSpace:'nowrap' }}>
                Recommended
              </span>}
            </div>
          </motion.button>

          {/* Divider */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ flex:1, height:1, background:'var(--border)' }}/>
            <span style={{ fontSize:'0.75rem', color:'var(--text-dim)', fontFamily:'monospace' }}>or connect existing</span>
            <div style={{ flex:1, height:1, background:'var(--border)' }}/>
          </div>

          {/* SECONDARY — connect existing bridge ID */}
          <div style={{ padding:'16px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg-surface2)' }}>
            <p style={{ fontSize:'0.78rem', fontWeight:700, color:'var(--text-muted)', marginBottom:10,
              textTransform:'uppercase', letterSpacing:'0.06em' }}>Have an existing Bridge ID?</p>
            <div style={{ display:'flex', gap:8 }}>
              <input value={bridgeId} onChange={e=>setBridgeId(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&connectBridge()}
                placeholder="br-xxxxxxxx"
                style={{ flex:1, padding:'10px 13px', borderRadius:9, fontSize:'0.875rem',
                  fontFamily:'monospace', border:'1.5px solid var(--border)',
                  background:'var(--bg-input)', color:'var(--text-primary)', outline:'none',
                  transition:'border-color .2s' }}
                onFocus={e=>e.target.style.borderColor='var(--accent)'}
                onBlur={e=>e.target.style.borderColor='var(--border)'}/>
              <Button onClick={connectBridge} loading={busy} disabled={!bridgeId.trim()}>Connect</Button>
            </div>
          </div>

        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', paddingTop:4 }}>
          <Button variant="secondary" onClick={() => setShowBridge(false)}>Cancel</Button>
        </div>
      </Modal>

      {/* ── Bridge Created Modal ── */}
      {bridgeInfo && (
        <BridgeInfoModal info={bridgeInfo} onClose={() => setBridgeInfo(null)}/>
      )}

      <ConfirmModal open={showDelete} onClose={() => setShowDelete(false)} onConfirm={deleteOrg} loading={busy} danger
        title="Delete Organization" message={`Delete "${org.name}"? This cannot be undone.`}/>
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Organizations() {
  const [orgs, setOrgs]   = useState([])
  const [loading, setLoad]= useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm]   = useState({ name:'',industry:'',city:'',address:'',phone:'',email:'' })
  const [busy, setBusy]   = useState(false)
  const { toast } = useToast()
  const { ready }  = useAuth()
  const { setOrgs: setContextOrgs } = useOrgContext()

  async function load() {
    setLoad(true)
    try { const r = await api.get('/organizations'); const data = r.data||[]; setOrgs(data); setContextOrgs(data) }
    catch(e) { toast(e.message,'error') }
    setLoad(false)
  }

  // Wait for auth init to complete (token restored from refresh token) before fetching
  useEffect(() => { if (ready) load() }, [ready])

  const sf = k => e => setForm(f=>({...f,[k]:e.target.value}))

  async function create() {
    if (!form.name) return toast('Organization name required','error')
    setBusy(true)
    try { await api.post('/organizations',form); toast('Organization created!','success'); setShowCreate(false); setForm({ name:'',industry:'',city:'',address:'',phone:'',email:'' }); load() }
    catch(e) { toast(e.message,'error') }
    finally { setBusy(false) }
  }

  return (
    <UserPage>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ fontSize:'1.875rem', fontWeight:800, color:'var(--text-primary)', letterSpacing:'-0.03em', display:'flex', alignItems:'center', gap:10, lineHeight:1.1 }}><Building2 size={26} style={{ color:'#58a6ff', flexShrink:0 }}/> Organizations</h1>
          <p style={{ fontSize:'0.875rem', color:'var(--text-muted)', marginTop:6 }}>Manage locations, bridges and biometric machines</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={13}/></Button>
          <Button onClick={() => setShowCreate(true)}><Plus size={15}/> New Organization</Button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
        <UserStatCard label="Total"    value={orgs.length}                                       icon={Building2} accent="#58a6ff" index={0}/>
        <UserStatCard label="Active"   value={orgs.filter(o=>o.isActive).length}                  icon={Building2} accent="#34d399" index={1}/>
        <UserStatCard label="Online"   value={orgs.filter(o=>o.bridgeOnline).length}              icon={Building2} accent="#34d399" index={2}/>
        <UserStatCard label="Offline"  value={orgs.filter(o=>o.bridgeId&&!o.bridgeOnline).length} icon={Building2} accent="#fb923c" index={3}/>
      </div>
      {loading ? <div className="">{[1,2,3].map(i=><div key={i} className="h-28 shimmer rounded-xl"/>)}</div>
        : orgs.length===0 ? (
          <div className="card"><Empty icon={Building2} title="No organizations yet" description="Create your first organization to connect biometric machines and track attendance."
            action={<Button onClick={() => setShowCreate(true)}><Plus size={15}/> Create Organization</Button>}/></div>
        ) : <motion.div layout className="">{orgs.map(org=><OrgCard key={org.orgId} org={org} onRefresh={load}/>)}</motion.div>}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Organization" description="Set up a new location" size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Input label="Organization Name *" value={form.name} onChange={sf('name')} placeholder="Acme Corp"/></div>
          <Input label="Industry" value={form.industry} onChange={sf('industry')} placeholder="Manufacturing"/>
          <Input label="City"     value={form.city}     onChange={sf('city')}     placeholder="Mumbai"/>
          <div className="col-span-2"><Input label="Address" value={form.address} onChange={sf('address')} placeholder="Street address"/></div>
          <Input label="Phone" icon={Phone} value={form.phone} onChange={sf('phone')} placeholder="+91..." type="tel"/>
          <Input label="Email" icon={Mail}  value={form.email} onChange={sf('email')} placeholder="hr@co.com" type="email"/>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button><Button onClick={create} loading={busy}>Create Organization</Button></div>
      </Modal>
    </UserPage>
  )
}