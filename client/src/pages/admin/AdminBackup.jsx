import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database, Download, Upload, Mail, Clock, CheckCircle2, XCircle,
  RefreshCw, Trash2, Plus, X, Shield, AlertTriangle, HardDrive,
  CalendarDays, Send, FileArchive, Settings2, ChevronDown, ChevronUp
} from 'lucide-react'
import { AdminPage, PageHeader, StatCard, SectionCard } from '../../components/admin/AdminUI'
import { Button }       from '../../components/ui/Button'
import { Input }        from '../../components/ui/Input'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import Pagination       from '../../components/ui/Pagination'
import { useToast }     from '../../components/ui/Toast'
import { useAuth }      from '../../store/auth'
import api              from '../../lib/api'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const FREQ = [
  { value:'daily',   label:'Daily' },
  { value:'weekly',  label:'Weekly' },
  { value:'monthly', label:'Monthly' },
]
const TZ_OPTIONS = [
  'Asia/Kolkata','Asia/Dubai','Asia/Singapore','Asia/Tokyo','Europe/London',
  'Europe/Berlin','America/New_York','America/Chicago','America/Los_Angeles','UTC',
]

function fmtBytes(b) {
  if (!b) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
}
function fmtDate(d) { return d ? new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—' }

const STATUS_META = {
  success: { color:'#34d399', bg:'rgba(52,211,153,.1)', icon:<CheckCircle2 size={13}/>, label:'Success' },
  failed:  { color:'#f87171', bg:'rgba(248,113,113,.1)', icon:<XCircle size={13}/>,    label:'Failed'  },
}
const ACTION_META = {
  create:  { color:'#58a6ff', label:'Backup Created', icon:<Database size={12}/> },
  email:   { color:'#a78bfa', label:'Email Sent',     icon:<Mail size={12}/> },
  restore: { color:'#fb923c', label:'Restore',        icon:<Upload size={12}/> },
}

function Pill({ val, meta }) {
  const m = meta[val] || { color:'var(--text-dim)', bg:'var(--bg-surface2)', label: val }
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:99, fontSize:'0.75rem', fontWeight:600, color:m.color, background:m.bg, whiteSpace:'nowrap' }}>
      {m.icon} {m.label}
    </span>
  )
}

export default function AdminBackup() {
  const { ready } = useAuth()
  const { toast } = useToast()

  // Settings
  const [settings, setSettings] = useState({
    scheduleEnabled: false, frequency: 'daily', sendTime: '02:00',
    timezone: 'Asia/Kolkata', recipients: [], keepLast: 7,
    weekday: 0, monthDay: 1,
    lastBackupAt: null, lastEmailAt: null, lastBackupFile: null,
  })
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')

  // Files on disk
  const [files, setFiles] = useState([])

  // Logs
  const [logs, setLogs]   = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage]   = useState(1)
  const [limit, setLimit] = useState(25)
  const [logBusy, setLogBusy] = useState(false)

  // Actions
  const [createBusy, setCreateBusy] = useState(false)
  const [emailBusy,  setEmailBusy]  = useState(false)
  const [restoreBusy,setRestoreBusy]= useState(false)
  const [restoreFile,setRestoreFile]= useState(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [confirmClearLogs, setConfirmClearLogs] = useState(false)
  const fileRef = useRef()

  useEffect(() => { if (ready) { loadSettings(); loadFiles(); loadLogs() } }, [ready])
  useEffect(() => { if (ready) loadLogs() }, [page, limit])

  async function loadSettings() {
    try {
      const r = await api.get('/admin/backup/settings')
      if (r.data && Object.keys(r.data).length) setSettings(s => ({ ...s, ...r.data }))
    } catch (e) { toast(e.message, 'error') }
  }

  async function loadFiles() {
    try {
      const r = await api.get('/admin/backup/files')
      setFiles(r.data || [])
    } catch (e) { /* non-critical */ }
  }

  async function loadLogs() {
    setLogBusy(true)
    try {
      const r = await api.get(`/admin/backup/logs?page=${page}&limit=${limit}`)
      setLogs(r.data || []); setTotal(r.total || 0)
    } catch (e) { toast(e.message, 'error') }
    finally { setLogBusy(false) }
  }

  async function saveSettings() {
    setSettingsBusy(true)
    try {
      await api.patch('/admin/backup/settings', settings)
      toast('Backup settings saved', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setSettingsBusy(false) }
  }

  async function createBackup(sendEmail = false) {
    setCreateBusy(true)
    try {
      const res = await api.post('/admin/backup/create', { email: sendEmail }, { responseType: 'arraybuffer' })
      const blob = new Blob([res], { type: 'application/gzip' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const now  = new Date().toISOString().replace('T','_').replace(/:/g,'-').slice(0,19)
      a.href = url; a.download = `backup_${now}.json.gz`; a.click()
      URL.revokeObjectURL(url)
      toast('Backup downloaded', 'success')
      loadFiles(); loadLogs()
    } catch (e) { toast(e.message, 'error') }
    finally { setCreateBusy(false) }
  }

  async function sendEmailNow() {
    setEmailBusy(true)
    try {
      const r = await api.post('/admin/backup/email')
      toast(`Sent to ${r.sent?.length} recipient(s)`, 'success')
      loadLogs(); loadSettings()
    } catch (e) { toast(e.message, 'error') }
    finally { setEmailBusy(false) }
  }

  function onFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.endsWith('.json.gz')) return toast('Select a .json.gz backup file', 'error')
    setRestoreFile(f)
    setConfirmRestore(true)
    e.target.value = ''
  }

  async function doRestore() {
    if (!restoreFile) return
    setRestoreBusy(true)
    try {
      const buf = await restoreFile.arrayBuffer()
      const r = await api.post(
        `/admin/backup/restore?filename=${encodeURIComponent(restoreFile.name)}`,
        buf,
        { headers: { 'Content-Type': 'application/octet-stream' } }
      )
      toast(`Restored ${r.restoredCollections} collections`, 'success')
      loadLogs()
    } catch (e) { toast(e.message, 'error') }
    finally { setRestoreBusy(false); setRestoreFile(null) }
  }

  async function clearLogs() {
    try {
      const r = await api.delete('/admin/backup/logs')
      toast(`Cleared ${r.deletedCount} log entries`, 'success')
      setPage(1); loadLogs()
    } catch (e) { toast(e.message, 'error') }
  }

  function addRecipient() {
    const email = newEmail.trim().toLowerCase()
    if (!email) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Invalid email address', 'error')
    if (settings.recipients.includes(email)) return toast('Already added', 'warning')
    setSettings(s => ({ ...s, recipients: [...s.recipients, email] }))
    setNewEmail('')
  }

  function removeRecipient(email) {
    setSettings(s => ({ ...s, recipients: s.recipients.filter(e => e !== email) }))
  }

  const pages = Math.ceil(total / limit)

  return (
    <AdminPage>
      <PageHeader
        title="Database Backup"
        subtitle="// create, schedule, email and restore backups"
        icon={Database}
      />

      {/* ── Stats ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:20 }}>
        <StatCard icon={HardDrive}    label="Files on Disk" value={files.length} accent="#58a6ff"/>
        <StatCard icon={Clock}        label="Last Backup"   value={settings.lastBackupAt ? fmtDate(settings.lastBackupAt) : 'Never'} accent="#34d399"/>
        <StatCard icon={Mail}         label="Last Email"    value={settings.lastEmailAt  ? fmtDate(settings.lastEmailAt)  : 'Never'} accent="#a78bfa"/>
        <StatCard icon={CalendarDays} label="Schedule"      value={settings.scheduleEnabled ? `${settings.frequency} @ ${settings.sendTime}` : 'Off'} accent="#fb923c"/>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

        {/* ── Left column ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Manual backup actions */}
          <SectionCard title="Manual Backup" description="// create now or send to configured emails">
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <Button onClick={() => createBackup(false)} loading={createBusy} style={{ width:'100%' }}>
                <Download size={15}/> Create & Download Backup
              </Button>
              <Button variant="secondary" onClick={sendEmailNow} loading={emailBusy} style={{ width:'100%' }}
                disabled={!settings.recipients?.length}>
                <Send size={15}/> Email Latest Backup
                {!settings.recipients?.length && <span style={{ fontSize:'0.75rem', marginLeft:4, opacity:.6 }}>(no recipients)</span>}
              </Button>
            </div>
          </SectionCard>

          {/* Restore */}
          <SectionCard title="Restore from Backup" description="// upload a .json.gz backup file">
            <div style={{
              padding:'12px 14px', borderRadius:10,
              background:'rgba(251,146,60,.06)', border:'1px solid rgba(251,146,60,.2)',
              display:'flex', gap:8, alignItems:'flex-start', marginBottom:12
            }}>
              <AlertTriangle size={14} style={{ color:'#fb923c', flexShrink:0, marginTop:2 }}/>
              <p style={{ fontSize:'0.8rem', color:'#fb923c', lineHeight:1.5, margin:0 }}>
                Restore will overwrite ALL existing data. This cannot be undone.
              </p>
            </div>
            <input ref={fileRef} type="file" accept=".json.gz" onChange={onFileChange} style={{ display:'none' }}/>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={restoreBusy} style={{ width:'100%' }}>
              <Upload size={15}/> Select Backup File…
            </Button>
          </SectionCard>

          {/* Files on disk */}
          <SectionCard title="Backup Files" description="// files stored on server">
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {files.length === 0 && (
                <p style={{ textAlign:'center', padding:'1.5rem 0', color:'var(--text-dim)', fontSize:'0.875rem' }}>No backup files yet</p>
              )}
              {files.map(f => (
                <div key={f.filename} style={{
                  display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
                  borderRadius:9, background:'var(--bg-surface2)', border:'1px solid var(--border)',
                }}>
                  <FileArchive size={14} style={{ color:'var(--accent)', flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.filename}</p>
                    <p style={{ fontSize:'0.72rem', color:'var(--text-dim)', marginTop:2 }}>{f.size} · {fmtDate(f.createdAt)}</p>
                  </div>
                  <a href={`/admin/backup/download/${f.filename}`}
                    style={{ color:'var(--accent)', flexShrink:0, display:'flex', alignItems:'center' }}
                    title="Download">
                    <Download size={14}/>
                  </a>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* ── Right column — Schedule Settings ── */}
        <SectionCard
          title={
            <button type="button" onClick={() => setSettingsOpen(o => !o)}
              style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'none', cursor:'pointer', color:'var(--text-primary)', padding:0, width:'100%' }}>
              <Settings2 size={15} style={{ color:'var(--accent)' }}/>
              <span style={{ fontWeight:700, flex:1, textAlign:'left' }}>Auto-Backup Schedule</span>
              {settingsOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>
          }
          description={settingsOpen ? '// configure schedule and email recipients' : ''}>

          <AnimatePresence>
            {settingsOpen && (
              <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
                style={{ overflow:'hidden' }}>
                <div style={{ display:'flex', flexDirection:'column', gap:14, paddingTop:4 }}>

                  {/* Enable toggle */}
                  <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                    <div onClick={() => setSettings(s => ({ ...s, scheduleEnabled: !s.scheduleEnabled }))}
                      style={{
                        width:40, height:22, borderRadius:99, padding:2, transition:'all .25s',
                        background: settings.scheduleEnabled ? 'var(--accent)' : 'var(--border)',
                        display:'flex', alignItems:'center',
                        justifyContent: settings.scheduleEnabled ? 'flex-end' : 'flex-start',
                      }}>
                      <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,.3)' }}/>
                    </div>
                    <span style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-secondary)' }}>
                      {settings.scheduleEnabled ? 'Scheduled backup enabled' : 'Scheduled backup disabled'}
                    </span>
                  </label>

                  {/* Frequency */}
                  <div>
                    <label style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }}>Frequency</label>
                    <div style={{ display:'flex', gap:6 }}>
                      {FREQ.map(f => (
                        <button type="button" key={f.value} onClick={() => setSettings(s => ({ ...s, frequency: f.value }))}
                          style={{
                            flex:1, padding:'7px 10px', borderRadius:8, border:`1px solid ${settings.frequency===f.value ? 'var(--accent)' : 'var(--border)'}`,
                            background: settings.frequency===f.value ? 'var(--accent-muted)' : 'var(--bg-surface2)',
                            color: settings.frequency===f.value ? 'var(--accent)' : 'var(--text-muted)',
                            fontWeight:600, fontSize:'0.8125rem', cursor:'pointer',
                          }}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Weekday (weekly only) */}
                  {settings.frequency === 'weekly' && (
                    <div>
                      <label style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }}>On Day</label>
                      <select value={settings.weekday} onChange={e => setSettings(s => ({ ...s, weekday: +e.target.value }))}
                        className="field-input" style={{ width:'100%' }}>
                        {DAYS.map((d,i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Month day (monthly only) */}
                  {settings.frequency === 'monthly' && (
                    <div>
                      <label style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }}>On Day of Month</label>
                      <Input type="number" value={settings.monthDay} onChange={e => setSettings(s => ({ ...s, monthDay: +e.target.value }))}
                        min={1} max={28} style={{ width:'100%' }}/>
                    </div>
                  )}

                  {/* Time & Timezone */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    <div>
                      <label style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }}>Time (24h)</label>
                      <Input type="time" value={settings.sendTime} onChange={e => setSettings(s => ({ ...s, sendTime: e.target.value }))}/>
                    </div>
                    <div>
                      <label style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }}>Timezone</label>
                      <select value={settings.timezone} onChange={e => setSettings(s => ({ ...s, timezone: e.target.value }))}
                        className="field-input" style={{ width:'100%' }}>
                        {TZ_OPTIONS.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Keep last N */}
                  <div>
                    <label style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }}>Keep Last N Files</label>
                    <Input type="number" value={settings.keepLast} min={1} max={30}
                      onChange={e => setSettings(s => ({ ...s, keepLast: +e.target.value }))}/>
                  </div>

                  {/* Recipients */}
                  <div>
                    <label style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }}>
                      Email Recipients
                    </label>
                    <div style={{ display:'flex', gap:6, marginBottom:8 }}>
                      <Input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                        placeholder="admin@example.com" type="email"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRecipient() } }}
                        style={{ flex:1 }}/>
                      <Button type="button" size="sm" onClick={addRecipient}><Plus size={13}/></Button>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                      {settings.recipients.map(email => (
                        <div key={email} style={{
                          display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
                          borderRadius:8, background:'var(--bg-surface2)', border:'1px solid var(--border)',
                        }}>
                          <Mail size={12} style={{ color:'var(--accent)', flexShrink:0 }}/>
                          <span style={{ flex:1, fontSize:'0.8125rem', color:'var(--text-primary)', fontFamily:'monospace' }}>{email}</span>
                          <button type="button" onClick={() => removeRecipient(email)}
                            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-dim)', padding:0, display:'flex' }}>
                            <X size={12}/>
                          </button>
                        </div>
                      ))}
                      {settings.recipients.length === 0 && (
                        <p style={{ fontSize:'0.78rem', color:'var(--text-dim)', textAlign:'center', padding:'8px 0' }}>No recipients added</p>
                      )}
                    </div>
                  </div>

                  <Button onClick={saveSettings} loading={settingsBusy} style={{ width:'100%' }}>
                    <Shield size={14}/> Save Settings
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </SectionCard>
      </div>

      {/* ── Backup Logs ── */}
      <div style={{ marginTop:20 }}>
        <SectionCard
          title="Backup Logs"
          description="// history of all backup, email and restore actions"
          action={
            <Button variant="secondary" size="sm" onClick={() => setConfirmClearLogs(true)}>
              <Trash2 size={13}/> Clear All
            </Button>
          }>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1.5fr 1fr', gap:0, marginBottom:8 }}>
            {['Action','Type','Status','File','Emailed To','Time'].map(h => (
              <div key={h} style={{ padding:'6px 10px', fontSize:'0.7rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid var(--border)' }}>{h}</div>
            ))}
          </div>

          {logBusy && <p style={{ textAlign:'center', padding:'2rem', color:'var(--text-dim)', fontSize:'0.875rem' }}>Loading…</p>}
          {!logBusy && logs.length === 0 && <p style={{ textAlign:'center', padding:'2rem', color:'var(--text-dim)', fontSize:'0.875rem' }}>No logs yet</p>}

          {!logBusy && logs.map((log, i) => (
            <div key={log._id} style={{
              display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1.5fr 1fr',
              background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface2)',
              borderRadius:6, transition:'background .15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background='var(--bg-surface2)'}
              onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--bg-surface2)'}>
              <div style={{ padding:'10px 10px', display:'flex', alignItems:'center' }}><Pill val={log.action} meta={ACTION_META}/></div>
              <div style={{ padding:'10px 10px', display:'flex', alignItems:'center' }}>
                <span style={{ fontSize:'0.78rem', fontFamily:'monospace', color:'var(--text-muted)', textTransform:'capitalize' }}>{log.type}</span>
              </div>
              <div style={{ padding:'10px 10px', display:'flex', alignItems:'center' }}><Pill val={log.status} meta={STATUS_META}/></div>
              <div style={{ padding:'10px 10px', display:'flex', alignItems:'center' }}>
                <span style={{ fontSize:'0.75rem', fontFamily:'monospace', color:'var(--text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {log.filename ? log.filename.replace('backup_','').replace('.json.gz','') : '—'}
                </span>
              </div>
              <div style={{ padding:'10px 10px', display:'flex', alignItems:'center', flexWrap:'wrap', gap:4 }}>
                {log.emailedTo?.length
                  ? log.emailedTo.map(e => (
                    <span key={e} style={{ fontSize:'0.72rem', fontFamily:'monospace', color:'var(--accent)', background:'var(--accent-muted)', padding:'1px 6px', borderRadius:4 }}>{e}</span>
                  ))
                  : <span style={{ fontSize:'0.78rem', color:'var(--text-dim)' }}>—</span>}
                {log.error && (
                  <span title={log.error} style={{ fontSize:'0.72rem', color:'#f87171', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:180 }}>
                    ⚠ {log.error.slice(0,40)}{log.error.length > 40 ? '…' : ''}
                  </span>
                )}
              </div>
              <div style={{ padding:'10px 10px', display:'flex', alignItems:'center' }}>
                <span style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>{fmtDate(log.createdAt)}</span>
              </div>
            </div>
          ))}

          <div style={{ marginTop:12 }}>
            <Pagination page={page} pages={pages} onPage={setPage} total={total} limit={limit}
              onLimit={n => { setLimit(n); setPage(1) }}/>
          </div>
        </SectionCard>
      </div>

      {/* Confirm restore */}
      <ConfirmModal
        open={confirmRestore}
        onClose={() => { setConfirmRestore(false); setRestoreFile(null) }}
        onConfirm={() => { setConfirmRestore(false); doRestore() }}
        title="Restore Database"
        message={`This will overwrite ALL existing data with the contents of "${restoreFile?.name}". This cannot be undone. Are you absolutely sure?`}
        danger
        loading={restoreBusy}
      />

      {/* Confirm clear logs */}
      <ConfirmModal
        open={confirmClearLogs}
        onClose={() => setConfirmClearLogs(false)}
        onConfirm={() => { setConfirmClearLogs(false); clearLogs() }}
        title="Clear Backup Logs"
        message="Delete all backup log entries? This only removes the log records, not the actual backup files."
        danger
      />
    </AdminPage>
  )
}
